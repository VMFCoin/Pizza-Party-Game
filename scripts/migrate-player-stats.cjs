#!/usr/bin/env node

/**
 * Migrate Player Stats to New Contract
 *
 * This script reads the extracted player data and calls the new contract's
 * migratePlayerStats function to import all lifetime stats and referral codes.
 *
 * Usage:
 *   1. Deploy the new contract first
 *   2. Set NEW_CONTRACT_ADDRESS below or in .env as GAME_CONTRACT_ADDRESS
 *   3. Run: node scripts/migrate-player-stats.cjs
 *
 * Requires: PRIVATE_KEY in .env (owner wallet)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load environment - parent .env takes priority over local scripts dir
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

// Configuration - UPDATE AFTER DEPLOYING NEW CONTRACT
const NEW_CONTRACT_ADDRESS = process.env.PIZZA_PARTY_ADDRESS || process.env.GAME_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL || process.env.RPC_BASE || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Contract ABI for migration function
const MIGRATION_ABI = [
  'function migratePlayerStats(address[] calldata players, tuple(uint256 totalDailyWins, uint256 totalWeeklyWins, uint256 totalVmfWon, uint256 lifetimeToppings, uint256 lifetimeReferrals)[] calldata stats, string[] calldata referralCodes) external',
  'function owner() view returns (address)',
  'function getPlayerLifetimeStats(address player) view returns (uint256 totalDailyWins, uint256 totalWeeklyWins, uint256 totalVmfWon, uint256 lifetimeToppings, uint256 lifetimeReferrals)',
  'event PlayerStatsMigrated(uint256 playerCount)',
];

// Validation
if (!NEW_CONTRACT_ADDRESS) {
  console.error('ERROR: NEW_CONTRACT_ADDRESS not set');
  console.error('Set GAME_CONTRACT_ADDRESS in .env or edit this script');
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY not set in .env');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('PIZZA PARTY - PLAYER STATS MIGRATION');
  console.log('='.repeat(60));
  console.log(`New Contract: ${NEW_CONTRACT_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log('');

  // Load extracted player data
  const dataPath = path.join(__dirname, 'player-data-export.json');
  if (!fs.existsSync(dataPath)) {
    console.error('ERROR: player-data-export.json not found');
    console.error('Run extract-player-data.cjs first');
    process.exit(1);
  }

  const exportData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const players = exportData.players;

  console.log(`Loaded ${players.length} players from export`);
  console.log('');

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(NEW_CONTRACT_ADDRESS, MIGRATION_ABI, wallet);

  // Verify we're the owner
  const owner = await contract.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`ERROR: Wallet ${wallet.address} is not the contract owner`);
    console.error(`Contract owner is: ${owner}`);
    process.exit(1);
  }

  console.log(`Wallet: ${wallet.address} (owner verified)`);
  console.log('');

  // Prepare migration data
  const addresses = [];
  const stats = [];
  const referralCodes = [];

  for (const player of players) {
    if (!player.lifetimeStats) continue;

    addresses.push(player.address);
    stats.push({
      totalDailyWins: player.lifetimeStats.totalDailyWins,
      totalWeeklyWins: player.lifetimeStats.totalWeeklyWins,
      totalVmfWon: player.lifetimeStats.totalVmfWon,
      lifetimeToppings: player.lifetimeStats.lifetimeToppings,
      lifetimeReferrals: player.lifetimeStats.lifetimeReferrals,
    });
    referralCodes.push(player.referralCode || '');
  }

  console.log(`Migrating ${addresses.length} players...`);
  console.log('');

  // Show preview
  console.log('Preview (first 5 players):');
  for (let i = 0; i < Math.min(5, addresses.length); i++) {
    const s = stats[i];
    console.log(`  ${addresses[i].slice(0, 10)}... | Daily: ${s.totalDailyWins} | Weekly: ${s.totalWeeklyWins} | VMF: ${ethers.formatEther(s.totalVmfWon)} | Code: ${referralCodes[i] || 'none'}`);
  }
  console.log('');

  // Estimate gas
  console.log('Estimating gas...');
  try {
    const gasEstimate = await contract.migratePlayerStats.estimateGas(addresses, stats, referralCodes);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    const estimatedCost = gasEstimate * gasPrice;

    console.log(`Gas estimate: ${gasEstimate.toString()}`);
    console.log(`Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    console.log(`Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
    console.log('');

    // Execute migration
    console.log('Executing migration...');
    const tx = await contract.migratePlayerStats(addresses, stats, referralCodes, {
      gasLimit: gasEstimate * 120n / 100n, // 20% buffer
      gasPrice: gasPrice * 110n / 100n, // 10% buffer
    });

    console.log(`Transaction submitted: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log('');
      console.log('='.repeat(60));
      console.log('MIGRATION SUCCESSFUL!');
      console.log('='.repeat(60));
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`Transaction: ${tx.hash}`);
      console.log('');

      // Verify a few players
      console.log('Verifying migration (checking first 3 players)...');
      for (let i = 0; i < Math.min(3, addresses.length); i++) {
        const verifyStats = await contract.getPlayerLifetimeStats(addresses[i]);
        console.log(`  ${addresses[i].slice(0, 10)}... | Daily: ${verifyStats.totalDailyWins} | Weekly: ${verifyStats.totalWeeklyWins} | VMF: ${ethers.formatEther(verifyStats.totalVmfWon)}`);
      }
      console.log('');
      console.log('Migration complete!');
    } else {
      console.error('Transaction failed!');
      process.exit(1);
    }
  } catch (e) {
    console.error('Migration failed:', e.message);

    // If batch is too large, suggest splitting
    if (e.message.includes('gas') || e.message.includes('out of gas')) {
      console.log('');
      console.log('TIP: If the batch is too large, edit this script to migrate in smaller batches');
    }

    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
