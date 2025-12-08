#!/usr/bin/env node

/**
 * Extract All Player Data for Migration
 *
 * Uses Blockscout API to fetch transaction history (free, reliable)
 * Then queries each player's stats via RPC with retry logic
 *
 * Output: JSON file with all data needed for migration to new contract
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const CONTRACT_ADDRESS = '0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB';
const RPC_URL = process.env.RPC_URL || process.env.RPC_BASE || 'https://mainnet.base.org';

// Blockscout API (free, no rate limits for basic queries)
const BLOCKSCOUT_API = 'https://base.blockscout.com/api/v2';

// Contract ABI (only the functions we need)
const CONTRACT_ABI = [
  'function dailyGameId() view returns (uint256)',
  'function weeklyGameId() view returns (uint256)',
  'function getPlayerLifetimeStats(address player) view returns (uint256 totalDailyWins, uint256 totalWeeklyWins, uint256 totalVmfWon, uint256 lifetimeToppings, uint256 lifetimeReferrals)',
  'function getPlayerWeeklyInfo(address player) view returns (uint256 toppingsEarned, uint256 toppingsClaimed, uint256 dailyPlays, uint256 referralsUsed, bool hasClaimed, uint256 projectedHoldingsBonus)',
  'function getReferralCode(address player) view returns (string)',
];

// Helper to delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to fetch from Blockscout with pagination
async function fetchAllTransactions(contractAddress) {
  const allTxs = [];
  let nextPageParams = null;
  let page = 1;

  while (true) {
    try {
      let url = `${BLOCKSCOUT_API}/addresses/${contractAddress}/transactions`;
      if (nextPageParams) {
        const params = new URLSearchParams(nextPageParams);
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        break;
      }

      allTxs.push(...data.items);
      console.log(`  Page ${page}: fetched ${data.items.length} transactions (total: ${allTxs.length})`);

      if (!data.next_page_params) {
        break;
      }

      nextPageParams = data.next_page_params;
      page++;
      await delay(200); // Small delay between pages
    } catch (e) {
      console.error(`  Error fetching page ${page}:`, e.message);
      break;
    }
  }

  return allTxs;
}

// Helper to call contract with retry
async function callWithRetry(contract, method, args = [], retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await contract[method](...args);
      return result;
    } catch (e) {
      if (i < retries - 1) {
        const waitTime = 1000 * (i + 1); // Exponential backoff
        await delay(waitTime);
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('PIZZA PARTY - PLAYER DATA EXTRACTION');
  console.log('='.repeat(60));
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log('');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  // Get current game IDs (with retry)
  console.log('Fetching current game IDs...');
  let dailyId, weeklyId;
  try {
    dailyId = await callWithRetry(contract, 'dailyGameId');
    weeklyId = await callWithRetry(contract, 'weeklyGameId');
  } catch (e) {
    console.error('Failed to fetch game IDs:', e.message);
    process.exit(1);
  }
  console.log(`Current Daily Game ID: ${dailyId}`);
  console.log(`Current Weekly Game ID: ${weeklyId}`);
  console.log('');

  // ========================================================================
  // STEP 1: Get all unique addresses from Blockscout transaction history
  // ========================================================================
  console.log('Step 1: Fetching all transactions to contract from Blockscout...');

  const transactions = await fetchAllTransactions(CONTRACT_ADDRESS);
  console.log(`\nTotal transactions fetched: ${transactions.length}`);

  const uniquePlayers = new Set();

  for (const tx of transactions) {
    // The 'from' address is the player (for successful transactions)
    if (tx.from && tx.from.hash && tx.status === 'ok') {
      const from = tx.from.hash.toLowerCase();
      // Skip known non-player addresses
      if (from !== CONTRACT_ADDRESS.toLowerCase() &&
          from !== '0x0000000000000000000000000000000000000000') {
        uniquePlayers.add(from);
      }
    }
  }

  const playerList = Array.from(uniquePlayers);
  console.log(`\nTotal unique addresses found: ${playerList.length}`);
  console.log('');

  // ========================================================================
  // STEP 2: Fetch lifetime stats for each player
  // ========================================================================
  console.log('Step 2: Fetching lifetime stats for each player...');
  console.log('  (This may take a while due to RPC rate limits)');
  console.log('');

  const playerData = [];
  let processed = 0;
  let errorCount = 0;
  let playersWithActivity = 0;

  for (const player of playerList) {
    try {
      // Get lifetime stats
      const stats = await callWithRetry(contract, 'getPlayerLifetimeStats', [player]);

      // Check if player has any activity
      const hasActivity =
        stats.totalDailyWins > 0n ||
        stats.totalWeeklyWins > 0n ||
        stats.totalVmfWon > 0n ||
        stats.lifetimeToppings > 0n ||
        stats.lifetimeReferrals > 0n;

      if (!hasActivity) {
        // Skip players with no activity (probably just approved token or admin)
        processed++;
        continue;
      }

      playersWithActivity++;

      // Get referral code (if any)
      let referralCode = '';
      try {
        referralCode = await callWithRetry(contract, 'getReferralCode', [player]);
      } catch (e) {
        // Player may not have a code - that's OK
      }

      // Get current weekly info
      let weeklyInfo = null;
      try {
        const wi = await callWithRetry(contract, 'getPlayerWeeklyInfo', [player]);
        weeklyInfo = {
          toppingsEarned: wi.toppingsEarned.toString(),
          toppingsClaimed: wi.toppingsClaimed.toString(),
          dailyPlays: wi.dailyPlays.toString(),
          referralsUsed: wi.referralsUsed.toString(),
          hasClaimed: wi.hasClaimed,
        };
      } catch (e) {
        // Ignore errors - weekly info is optional
      }

      const data = {
        address: player,
        lifetimeStats: {
          totalDailyWins: stats.totalDailyWins.toString(),
          totalWeeklyWins: stats.totalWeeklyWins.toString(),
          totalVmfWon: stats.totalVmfWon.toString(),
          totalVmfWonFormatted: ethers.formatEther(stats.totalVmfWon),
          lifetimeToppings: stats.lifetimeToppings.toString(),
          lifetimeReferrals: stats.lifetimeReferrals.toString(),
        },
        referralCode: referralCode || null,
        currentWeeklyInfo: weeklyInfo,
      };

      playerData.push(data);
      processed++;

      if (processed % 5 === 0 || playersWithActivity % 3 === 0) {
        console.log(`  Processed ${processed}/${playerList.length} addresses, ${playersWithActivity} active players found...`);
      }

      // Delay between requests
      await delay(300);
    } catch (e) {
      console.error(`  Error fetching data for ${player}: ${e.message}`);
      processed++;
      errorCount++;
      await delay(2000); // Longer delay on error
    }
  }

  console.log(`\nCompleted: ${processed} addresses processed, ${playersWithActivity} active players, ${errorCount} errors`);
  console.log('');

  // ========================================================================
  // STEP 3: Compile summary statistics
  // ========================================================================
  console.log('Step 3: Compiling summary statistics...');

  const summary = {
    extractionTimestamp: new Date().toISOString(),
    contractAddress: CONTRACT_ADDRESS,
    currentDailyGameId: dailyId.toString(),
    currentWeeklyGameId: weeklyId.toString(),
    totalAddressesScanned: playerList.length,
    totalActivePlayers: playersWithActivity,
    totalPlayersWithErrors: errorCount,

    // Aggregate stats
    playersWithWins: playerData.filter(p =>
      p.lifetimeStats && (
        Number(p.lifetimeStats.totalDailyWins) > 0 ||
        Number(p.lifetimeStats.totalWeeklyWins) > 0
      )
    ).length,
    playersWithReferralCodes: playerData.filter(p => p.referralCode).length,
    totalVmfWonAllPlayers: playerData.reduce((sum, p) => {
      if (p.lifetimeStats) {
        return sum + BigInt(p.lifetimeStats.totalVmfWon);
      }
      return sum;
    }, 0n).toString(),
    totalVmfWonAllPlayersFormatted: '0',
    totalLifetimeToppings: playerData.reduce((sum, p) => {
      if (p.lifetimeStats) {
        return sum + BigInt(p.lifetimeStats.lifetimeToppings);
      }
      return sum;
    }, 0n).toString(),
    totalLifetimeReferrals: playerData.reduce((sum, p) => {
      if (p.lifetimeStats) {
        return sum + BigInt(p.lifetimeStats.lifetimeReferrals);
      }
      return sum;
    }, 0n).toString(),
  };

  // Format total VMF
  summary.totalVmfWonAllPlayersFormatted = ethers.formatEther(summary.totalVmfWonAllPlayers);

  console.log('');
  console.log('Summary:');
  console.log(`  Addresses Scanned: ${summary.totalAddressesScanned}`);
  console.log(`  Active Players: ${summary.totalActivePlayers}`);
  console.log(`  Players with Wins: ${summary.playersWithWins}`);
  console.log(`  Players with Referral Codes: ${summary.playersWithReferralCodes}`);
  console.log(`  Total VMF Won: ${summary.totalVmfWonAllPlayersFormatted} VMF`);
  console.log(`  Total Lifetime Toppings: ${summary.totalLifetimeToppings}`);
  console.log(`  Total Lifetime Referrals: ${summary.totalLifetimeReferrals}`);
  console.log('');

  // ========================================================================
  // STEP 4: Save to file
  // ========================================================================
  const outputData = {
    summary,
    players: playerData.sort((a, b) => {
      // Sort by total VMF won (descending)
      const aVmf = a.lifetimeStats ? BigInt(a.lifetimeStats.totalVmfWon) : 0n;
      const bVmf = b.lifetimeStats ? BigInt(b.lifetimeStats.totalVmfWon) : 0n;
      if (bVmf > aVmf) return 1;
      if (bVmf < aVmf) return -1;
      return 0;
    }),
  };

  const outputPath = path.join(__dirname, 'player-data-export.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`Data saved to: ${outputPath}`);

  // Also save a CSV for easy viewing
  const csvPath = path.join(__dirname, 'player-data-export.csv');
  const csvHeader = 'Address,Daily Wins,Weekly Wins,VMF Won,Lifetime Toppings,Lifetime Referrals,Referral Code\n';
  const csvRows = playerData
    .filter(p => p.lifetimeStats)
    .map(p => {
      const s = p.lifetimeStats;
      return `${p.address},${s.totalDailyWins},${s.totalWeeklyWins},${s.totalVmfWonFormatted},${s.lifetimeToppings},${s.lifetimeReferrals},${p.referralCode || ''}`;
    })
    .join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`CSV saved to: ${csvPath}`);

  console.log('');
  console.log('='.repeat(60));
  console.log('EXTRACTION COMPLETE');
  console.log('='.repeat(60));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
