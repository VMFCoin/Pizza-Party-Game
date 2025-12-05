const { createPublicClient, http, formatUnits, decodeEventLog } = require('viem');
const { base } = require('viem/chains');

const OLD_CONTRACT = '0x5c3aaD450F0014292Ff363b2147e6571b16c8035';
const NEW_CONTRACT = '0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB';

const ABI = [
  {
    type: 'event',
    name: 'DailyGameSettled',
    inputs: [
      { indexed: true, name: 'gameId', type: 'uint256' },
      { indexed: false, name: 'winners', type: 'address[]' },
      { indexed: false, name: 'pot', type: 'uint256' }
    ]
  },
  {
    type: 'event',
    name: 'WeeklyGameSettled',
    inputs: [
      { indexed: true, name: 'weekId', type: 'uint256' },
      { indexed: false, name: 'winners', type: 'address[]' },
      { indexed: false, name: 'pot', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    name: 'getPlayerLifetimeStats',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'player' }],
    outputs: [{
      type: 'tuple',
      components: [
        { type: 'uint256', name: 'totalDailyWins' },
        { type: 'uint256', name: 'totalWeeklyWins' },
        { type: 'uint256', name: 'totalVmfWon' },
        { type: 'uint256', name: 'lifetimeToppings' },
        { type: 'uint256', name: 'lifetimeReferrals' }
      ]
    }]
  }
];

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
});

async function main() {
  console.log('====================================================================================================');
  console.log('FETCHING ALL DAILY & WEEKLY GAME SETTLEMENTS FROM BLOCKCHAIN');
  console.log('Old Contract: 0x5c3aaD450F0014292Ff363b2147e6571b16c8035');
  console.log('New Contract: 0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB');
  console.log('====================================================================================================');
  console.log('');

  // Track all player stats
  const playerStats = new Map();

  function addWin(address, type, vmfWon, gameId) {
    const addr = address.toLowerCase();
    if (!playerStats.has(addr)) {
      playerStats.set(addr, {
        address: addr,
        dailyWins: 0,
        weeklyWins: 0,
        totalVmfWon: 0,
        dailyGamesWon: [],
        weeklyGamesWon: [],
      });
    }
    const stats = playerStats.get(addr);
    if (type === 'daily') {
      stats.dailyWins++;
      stats.dailyGamesWon.push(gameId);
    } else {
      stats.weeklyWins++;
      stats.weeklyGamesWon.push(gameId);
    }
    stats.totalVmfWon += vmfWon;
  }

  console.log('Fetching Daily Game Settled events from OLD contract...');

  try {
    // Old contract deployed around block 37700000
    const oldDailyLogs = await client.getLogs({
      address: OLD_CONTRACT,
      event: {
        type: 'event',
        name: 'DailyGameSettled',
        inputs: [
          { indexed: true, name: 'gameId', type: 'uint256' },
          { indexed: false, name: 'winners', type: 'address[]' },
          { indexed: false, name: 'pot', type: 'uint256' }
        ]
      },
      fromBlock: 37700000n,
      toBlock: 'latest',
    });

    console.log(`Found ${oldDailyLogs.length} DailyGameSettled events from old contract`);

    for (const log of oldDailyLogs) {
      const gameId = Number(log.args.gameId);
      const winners = log.args.winners || [];
      const pot = log.args.pot || 0n;
      const payoutPerWinner = winners.length > 0 ? (Number(formatUnits(pot, 18)) * 0.94) / winners.length : 0;

      console.log(`  Game ${gameId}: ${winners.length} winners, pot = ${Number(formatUnits(pot, 18)).toFixed(1)} VMF`);

      for (const winner of winners) {
        addWin(winner, 'daily', payoutPerWinner, gameId);
      }
    }
  } catch (err) {
    console.error('Error fetching old contract daily logs:', err.message);
  }

  console.log('');
  console.log('Fetching Weekly Game Settled events from OLD contract...');

  try {
    const oldWeeklyLogs = await client.getLogs({
      address: OLD_CONTRACT,
      event: {
        type: 'event',
        name: 'WeeklyGameSettled',
        inputs: [
          { indexed: true, name: 'weekId', type: 'uint256' },
          { indexed: false, name: 'winners', type: 'address[]' },
          { indexed: false, name: 'pot', type: 'uint256' }
        ]
      },
      fromBlock: 37700000n,
      toBlock: 'latest',
    });

    console.log(`Found ${oldWeeklyLogs.length} WeeklyGameSettled events from old contract`);

    for (const log of oldWeeklyLogs) {
      const weekId = Number(log.args.weekId);
      const winners = log.args.winners || [];
      const pot = log.args.pot || 0n;
      const payoutPerWinner = winners.length > 0 ? Number(formatUnits(pot, 18)) / winners.length : 0;

      console.log(`  Week ${weekId}: ${winners.length} winners, pot = ${Number(formatUnits(pot, 18)).toFixed(1)} VMF`);

      for (const winner of winners) {
        addWin(winner, 'weekly', payoutPerWinner, weekId);
      }
    }
  } catch (err) {
    console.error('Error fetching old contract weekly logs:', err.message);
  }

  console.log('');
  console.log('Fetching Daily Game Settled events from NEW contract...');

  try {
    // New contract deployed around block 38917000
    const newDailyLogs = await client.getLogs({
      address: NEW_CONTRACT,
      event: {
        type: 'event',
        name: 'DailyGameSettled',
        inputs: [
          { indexed: true, name: 'gameId', type: 'uint256' },
          { indexed: false, name: 'winners', type: 'address[]' },
          { indexed: false, name: 'pot', type: 'uint256' }
        ]
      },
      fromBlock: 38917000n,
      toBlock: 'latest',
    });

    console.log(`Found ${newDailyLogs.length} DailyGameSettled events from new contract`);

    for (const log of newDailyLogs) {
      const gameId = Number(log.args.gameId);
      const winners = log.args.winners || [];
      const pot = log.args.pot || 0n;
      const payoutPerWinner = winners.length > 0 ? (Number(formatUnits(pot, 18)) * 0.94) / winners.length : 0;

      console.log(`  Game ${gameId}: ${winners.length} winners, pot = ${Number(formatUnits(pot, 18)).toFixed(1)} VMF`);

      for (const winner of winners) {
        addWin(winner, 'daily', payoutPerWinner, gameId);
      }
    }
  } catch (err) {
    console.error('Error fetching new contract daily logs:', err.message);
  }

  console.log('');
  console.log('Fetching Weekly Game Settled events from NEW contract...');

  try {
    const newWeeklyLogs = await client.getLogs({
      address: NEW_CONTRACT,
      event: {
        type: 'event',
        name: 'WeeklyGameSettled',
        inputs: [
          { indexed: true, name: 'weekId', type: 'uint256' },
          { indexed: false, name: 'winners', type: 'address[]' },
          { indexed: false, name: 'pot', type: 'uint256' }
        ]
      },
      fromBlock: 38917000n,
      toBlock: 'latest',
    });

    console.log(`Found ${newWeeklyLogs.length} WeeklyGameSettled events from new contract`);

    for (const log of newWeeklyLogs) {
      const weekId = Number(log.args.weekId);
      const winners = log.args.winners || [];
      const pot = log.args.pot || 0n;
      const payoutPerWinner = winners.length > 0 ? Number(formatUnits(pot, 18)) / winners.length : 0;

      console.log(`  Week ${weekId}: ${winners.length} winners, pot = ${Number(formatUnits(pot, 18)).toFixed(1)} VMF`);

      for (const winner of winners) {
        addWin(winner, 'weekly', payoutPerWinner, weekId);
      }
    }
  } catch (err) {
    console.error('Error fetching new contract weekly logs:', err.message);
  }

  // Convert to array and sort
  const results = Array.from(playerStats.values());
  results.sort((a, b) => {
    const totalA = a.dailyWins + a.weeklyWins;
    const totalB = b.dailyWins + b.weeklyWins;
    if (totalB !== totalA) return totalB - totalA;
    return b.totalVmfWon - a.totalVmfWon;
  });

  console.log('');
  console.log('====================================================================================================');
  console.log('COMPLETE PLAYER STATS FROM GAME 1 TO CURRENT');
  console.log('====================================================================================================');
  console.log('');
  console.log('RANK | ADDRESS                                      | DAILY | WEEKLY | TOTAL | VMF WON    | GAMES WON');
  console.log('-----|----------------------------------------------+-------+--------+-------+------------+------------------');

  results.forEach((r, i) => {
    const rank = String(i+1).padStart(4);
    const daily = String(r.dailyWins).padStart(5);
    const weekly = String(r.weeklyWins).padStart(6);
    const total = String(r.dailyWins + r.weeklyWins).padStart(5);
    const vmf = r.totalVmfWon.toFixed(1).padStart(10);
    const games = [...r.dailyGamesWon.map(g => `D${g}`), ...r.weeklyGamesWon.map(w => `W${w}`)].join(', ');
    console.log(rank + ' | ' + r.address + ' | ' + daily + ' | ' + weekly + ' | ' + total + ' | ' + vmf + ' | ' + games);
  });

  console.log('');
  console.log('====================================================================================================');
  console.log('SUMMARY');
  console.log('====================================================================================================');
  console.log('Total unique winners:', results.length);
  console.log('Total daily wins across all players:', results.reduce((sum, r) => sum + r.dailyWins, 0));
  console.log('Total weekly wins across all players:', results.reduce((sum, r) => sum + r.weeklyWins, 0));
  console.log('Total VMF distributed:', results.reduce((sum, r) => sum + r.totalVmfWon, 0).toFixed(1));
  console.log('====================================================================================================');
}

main().catch(console.error);
