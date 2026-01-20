/**
 * PRE-MIGRATION STATS RECORDER
 *
 * Run this BEFORE executing the token migration to capture all game stats.
 * This creates a snapshot of:
 * - Current Daily Game ID
 * - Current Weekly Game ID
 * - All player lifetime stats (wins, PIZZA won, toppings, referrals)
 *
 * Usage:
 *   npx ts-node migration/record-pre-migration-stats.ts
 *
 * Output:
 *   migration/pre-migration-snapshot-{timestamp}.json
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';

// Contract addresses
const PIZZA_PARTY_ADDRESS = '0xA1C31c3eF1448351da0b1D430148660982B6f3dD' as const;
const PIZZA_STAKING_ADDRESS = '0xCbAf5bACe5419710C3852653d3DdEB831d7415be' as const;

// Old token address (for reference)
const OLD_PIZZA_TOKEN = '0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69';

// ABI for reading game data
const PIZZA_PARTY_ABI = [
  { inputs: [], name: 'dailyGameId', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'weeklyGameId', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: 'dailyGames', outputs: [
    { type: 'uint256', name: 'startTime' },
    { type: 'uint256', name: 'endTime' },
    { type: 'address', name: 'firstPlayer' },
    { type: 'uint256', name: 'potAmount' },
    { type: 'bool', name: 'settled' }
  ], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: 'weeklyGames', outputs: [
    { type: 'uint256', name: 'claimWindowStart' },
    { type: 'uint256', name: 'claimWindowEnd' },
    { type: 'uint256', name: 'totalClaimedToppings' },
    { type: 'uint256', name: 'potAmount' },
    { type: 'bool', name: 'settled' }
  ], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: 'getDailyGamePlayers', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: 'getDailyGameWinners', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: 'getWeeklyGameWinners', outputs: [{ type: 'address[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address' }], name: 'getPlayerLifetimeStats', outputs: [
    { type: 'uint256', name: 'totalDailyWins' },
    { type: 'uint256', name: 'totalWeeklyWins' },
    { type: 'uint256', name: 'totalPizzaWon' },
    { type: 'uint256', name: 'lifetimeToppings' },
    { type: 'uint256', name: 'lifetimeReferrals' }
  ], stateMutability: 'view', type: 'function' },
] as const;

const STAKING_ABI = [
  { inputs: [], name: 'totalStakers', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalStaked', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address' }], name: 'userPositions', outputs: [
    { type: 'uint256', name: 'flexibleAmount' },
    { type: 'uint256', name: 'lockedAmount' },
    { type: 'uint256', name: 'lockEndTime' },
    { type: 'uint256', name: 'lastSpinTime' },
    { type: 'uint256', name: 'pendingRewards' },
    { type: 'uint256', name: 'lifetimeStaked' },
    { type: 'uint256', name: 'lifetimeRewards' }
  ], stateMutability: 'view', type: 'function' },
] as const;

// Create client
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
});

interface PlayerStats {
  address: string;
  totalDailyWins: number;
  totalWeeklyWins: number;
  totalGamesWon: number; // daily + weekly combined
  totalPizzaWon: string;
  totalPizzaWonWei: string;
  lifetimeToppings: number;
  lifetimeReferrals: number;
  // Game-by-game breakdown
  dailyGamesWon: number[]; // List of daily game IDs won
  weeklyGamesWon: number[]; // List of weekly game IDs won
}

interface DailyGameData {
  gameId: number;
  startTime: string;
  endTime: string;
  potAmount: string;
  potAmountWei: string;
  settled: boolean;
  players: string[];
  winners: string[];
}

interface WeeklyGameData {
  weekId: number;
  claimWindowStart: string;
  claimWindowEnd: string;
  totalClaimedToppings: number;
  potAmount: string;
  potAmountWei: string;
  settled: boolean;
  winners: string[];
}

interface MigrationSnapshot {
  timestamp: string;
  oldTokenAddress: string;
  contracts: {
    pizzaParty: string;
    pizzaStaking: string;
  };
  gameState: {
    currentDailyGameId: number;
    currentWeeklyGameId: number;
  };
  dailyGames: DailyGameData[];
  weeklyGames: WeeklyGameData[];
  playerStats: PlayerStats[];
  stakingStats: {
    totalStakers: number;
    totalStaked: string;
    totalStakedWei: string;
  };
  summary: {
    totalUniquePlayers: number;
    totalDailyWins: number;
    totalWeeklyWins: number;
    totalGamesWon: number; // daily + weekly combined
    totalPizzaDistributed: string;
  };
}

async function main() {
  console.log('========================================');
  console.log('  PRE-MIGRATION STATS RECORDER');
  console.log('========================================\n');

  const snapshot: MigrationSnapshot = {
    timestamp: new Date().toISOString(),
    oldTokenAddress: OLD_PIZZA_TOKEN,
    contracts: {
      pizzaParty: PIZZA_PARTY_ADDRESS,
      pizzaStaking: PIZZA_STAKING_ADDRESS,
    },
    gameState: {
      currentDailyGameId: 0,
      currentWeeklyGameId: 0,
    },
    dailyGames: [],
    weeklyGames: [],
    playerStats: [],
    stakingStats: {
      totalStakers: 0,
      totalStaked: '0',
      totalStakedWei: '0',
    },
    summary: {
      totalUniquePlayers: 0,
      totalDailyWins: 0,
      totalWeeklyWins: 0,
      totalGamesWon: 0,
      totalPizzaDistributed: '0',
    },
  };

  // 1. Get current game IDs
  console.log('📊 Fetching current game IDs...');
  const [dailyGameId, weeklyGameId] = await Promise.all([
    publicClient.readContract({
      address: PIZZA_PARTY_ADDRESS,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGameId',
    }),
    publicClient.readContract({
      address: PIZZA_PARTY_ADDRESS,
      abi: PIZZA_PARTY_ABI,
      functionName: 'weeklyGameId',
    }),
  ]);

  snapshot.gameState.currentDailyGameId = Number(dailyGameId);
  snapshot.gameState.currentWeeklyGameId = Number(weeklyGameId);

  console.log(`   Daily Game ID: ${dailyGameId}`);
  console.log(`   Weekly Game ID: ${weeklyGameId}\n`);

  // 2. Collect all unique player addresses from daily games
  console.log('👥 Collecting player addresses from daily games...');
  const allPlayers = new Set<string>();

  for (let gameId = 1; gameId <= Number(dailyGameId); gameId++) {
    try {
      const [gameData, players, winners] = await Promise.all([
        publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGames',
          args: [BigInt(gameId)],
        }),
        publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getDailyGamePlayers',
          args: [BigInt(gameId)],
        }),
        publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getDailyGameWinners',
          args: [BigInt(gameId)],
        }),
      ]);

      const dailyGame: DailyGameData = {
        gameId,
        startTime: new Date(Number(gameData[0]) * 1000).toISOString(),
        endTime: new Date(Number(gameData[1]) * 1000).toISOString(),
        potAmount: formatUnits(gameData[3], 18),
        potAmountWei: gameData[3].toString(),
        settled: gameData[4],
        players: players as string[],
        winners: winners as string[],
      };

      snapshot.dailyGames.push(dailyGame);

      // Add players to set
      for (const player of players as string[]) {
        allPlayers.add(player.toLowerCase());
      }

      console.log(`   Game ${gameId}: ${(players as string[]).length} players, ${(winners as string[]).length} winners`);
    } catch (err) {
      console.log(`   Game ${gameId}: Error fetching (may not exist)`);
    }
  }

  // 3. Collect weekly game data
  console.log('\n🎰 Collecting weekly game data...');
  for (let weekId = 1; weekId <= Number(weeklyGameId); weekId++) {
    try {
      const [weekData, winners] = await Promise.all([
        publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS,
          abi: PIZZA_PARTY_ABI,
          functionName: 'weeklyGames',
          args: [BigInt(weekId)],
        }),
        publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getWeeklyGameWinners',
          args: [BigInt(weekId)],
        }),
      ]);

      const weeklyGame: WeeklyGameData = {
        weekId,
        claimWindowStart: new Date(Number(weekData[0]) * 1000).toISOString(),
        claimWindowEnd: new Date(Number(weekData[1]) * 1000).toISOString(),
        totalClaimedToppings: Number(weekData[2]),
        potAmount: formatUnits(weekData[3], 18),
        potAmountWei: weekData[3].toString(),
        settled: weekData[4],
        winners: winners as string[],
      };

      snapshot.weeklyGames.push(weeklyGame);

      // Add winners to player set
      for (const winner of winners as string[]) {
        allPlayers.add(winner.toLowerCase());
      }

      console.log(`   Week ${weekId}: ${(winners as string[]).length} winners, ${weekData[2]} toppings claimed`);
    } catch (err) {
      console.log(`   Week ${weekId}: Error fetching (may not exist)`);
    }
  }

  // 4. Build player win history from game data
  console.log('\n🏆 Building player win history...');
  const playerDailyWins: Map<string, number[]> = new Map();
  const playerWeeklyWins: Map<string, number[]> = new Map();

  // Track which daily games each player won
  for (const game of snapshot.dailyGames) {
    for (const winner of game.winners) {
      const addr = winner.toLowerCase();
      if (!playerDailyWins.has(addr)) {
        playerDailyWins.set(addr, []);
      }
      playerDailyWins.get(addr)!.push(game.gameId);
    }
  }

  // Track which weekly games each player won
  for (const week of snapshot.weeklyGames) {
    for (const winner of week.winners) {
      const addr = winner.toLowerCase();
      if (!playerWeeklyWins.has(addr)) {
        playerWeeklyWins.set(addr, []);
      }
      playerWeeklyWins.get(addr)!.push(week.weekId);
    }
  }

  // 5. Fetch lifetime stats for all players
  console.log(`\n📈 Fetching lifetime stats for ${allPlayers.size} unique players...`);
  const playerList = Array.from(allPlayers);
  let totalDailyWins = 0;
  let totalWeeklyWins = 0;
  let totalPizzaWon = 0n;

  for (const player of playerList) {
    try {
      const stats = await publicClient.readContract({
        address: PIZZA_PARTY_ADDRESS,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [player as `0x${string}`],
      });

      const dailyGamesWon = playerDailyWins.get(player) || [];
      const weeklyGamesWon = playerWeeklyWins.get(player) || [];

      const playerStats: PlayerStats = {
        address: player,
        totalDailyWins: Number(stats[0]),
        totalWeeklyWins: Number(stats[1]),
        totalGamesWon: Number(stats[0]) + Number(stats[1]),
        totalPizzaWon: formatUnits(stats[2], 18),
        totalPizzaWonWei: stats[2].toString(),
        lifetimeToppings: Number(stats[3]),
        lifetimeReferrals: Number(stats[4]),
        dailyGamesWon,
        weeklyGamesWon,
      };

      snapshot.playerStats.push(playerStats);

      totalDailyWins += Number(stats[0]);
      totalWeeklyWins += Number(stats[1]);
      totalPizzaWon += stats[2];
    } catch (err) {
      console.log(`   Error fetching stats for ${player}`);
    }
  }

  // 5. Fetch staking stats
  console.log('\n🥩 Fetching staking stats...');
  try {
    const [totalStakers, totalStaked] = await Promise.all([
      publicClient.readContract({
        address: PIZZA_STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'totalStakers',
      }),
      publicClient.readContract({
        address: PIZZA_STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'totalStaked',
      }),
    ]);

    snapshot.stakingStats = {
      totalStakers: Number(totalStakers),
      totalStaked: formatUnits(totalStaked, 18),
      totalStakedWei: totalStaked.toString(),
    };

    console.log(`   Total Stakers: ${totalStakers}`);
    console.log(`   Total Staked: ${formatUnits(totalStaked, 18)} PIZZA`);
  } catch (err) {
    console.log('   Error fetching staking stats');
  }

  // 7. Calculate summary
  snapshot.summary = {
    totalUniquePlayers: playerList.length,
    totalDailyWins,
    totalWeeklyWins,
    totalGamesWon: totalDailyWins + totalWeeklyWins,
    totalPizzaDistributed: formatUnits(totalPizzaWon, 18),
  };

  // 7. Write snapshot to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `pre-migration-snapshot-${timestamp}.json`;
  const filepath = path.join(__dirname, filename);

  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));

  console.log('\n========================================');
  console.log('  SNAPSHOT COMPLETE');
  console.log('========================================');
  console.log(`\n📁 Saved to: ${filename}`);
  console.log('\n📊 Summary:');
  console.log(`   Daily Game ID: ${snapshot.gameState.currentDailyGameId}`);
  console.log(`   Weekly Game ID: ${snapshot.gameState.currentWeeklyGameId}`);
  console.log(`   Unique Players: ${snapshot.summary.totalUniquePlayers}`);
  console.log(`   Total Daily Wins: ${snapshot.summary.totalDailyWins}`);
  console.log(`   Total Weekly Wins: ${snapshot.summary.totalWeeklyWins}`);
  console.log(`   Total Games Won: ${snapshot.summary.totalGamesWon}`);
  console.log(`   Total PIZZA Distributed: ${snapshot.summary.totalPizzaDistributed}`);
  console.log(`   Total Stakers: ${snapshot.stakingStats.totalStakers}`);
  console.log(`   Total Staked: ${snapshot.stakingStats.totalStaked} PIZZA`);
  console.log('\n✅ Ready for migration!\n');
}

main().catch(console.error);
