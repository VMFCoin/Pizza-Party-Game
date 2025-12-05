const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');

// All known PizzaParty contract addresses
const CONTRACTS = [
  { address: '0x5c3aaD450F0014292Ff363b2147e6571b16c8035', name: 'Old Contract', fromBlock: 37700000n },
  { address: '0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB', name: 'New Contract (Game 13+)', fromBlock: 38917000n },
];

const DAILY_SETTLED_EVENT = {
  type: 'event',
  name: 'DailyGameSettled',
  inputs: [
    { indexed: true, name: 'gameId', type: 'uint256' },
    { indexed: false, name: 'winners', type: 'address[]' },
    { indexed: false, name: 'pot', type: 'uint256' }
  ]
};

const WEEKLY_SETTLED_EVENT = {
  type: 'event',
  name: 'WeeklyGameSettled',
  inputs: [
    { indexed: true, name: 'weekId', type: 'uint256' },
    { indexed: false, name: 'winners', type: 'address[]' },
    { indexed: false, name: 'pot', type: 'uint256' }
  ]
};

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
});

async function main() {
  console.log('====================================================================================================');
  console.log('COMPLETE PIZZA PARTY GAME HISTORY - ALL SETTLEMENTS');
  console.log('====================================================================================================');
  console.log('');

  const playerStats = new Map();
  const allDailyGames = [];
  const allWeeklyGames = [];

  function addWin(address, type, vmfWon, gameId, contractName) {
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

  for (const contract of CONTRACTS) {
    console.log(`Scanning ${contract.name} (${contract.address})...`);

    try {
      const dailyLogs = await client.getLogs({
        address: contract.address,
        event: DAILY_SETTLED_EVENT,
        fromBlock: contract.fromBlock,
        toBlock: 'latest',
      });

      console.log(`  Found ${dailyLogs.length} DailyGameSettled events`);

      for (const log of dailyLogs) {
        const gameId = Number(log.args.gameId);
        const winners = log.args.winners || [];
        const pot = log.args.pot || 0n;
        const potNum = Number(formatUnits(pot, 18));
        const payoutPerWinner = winners.length > 0 ? (potNum * 0.94) / winners.length : 0;

        allDailyGames.push({
          gameId,
          winners: winners.map(w => w.toLowerCase()),
          pot: potNum,
          payoutPerWinner,
          blockNumber: Number(log.blockNumber),
          contract: contract.name,
        });

        for (const winner of winners) {
          addWin(winner, 'daily', payoutPerWinner, gameId, contract.name);
        }
      }
    } catch (err) {
      console.error(`  Error fetching daily logs: ${err.message}`);
    }

    try {
      const weeklyLogs = await client.getLogs({
        address: contract.address,
        event: WEEKLY_SETTLED_EVENT,
        fromBlock: contract.fromBlock,
        toBlock: 'latest',
      });

      console.log(`  Found ${weeklyLogs.length} WeeklyGameSettled events`);

      for (const log of weeklyLogs) {
        const weekId = Number(log.args.weekId);
        const winners = log.args.winners || [];
        const pot = log.args.pot || 0n;
        const potNum = Number(formatUnits(pot, 18));
        const payoutPerWinner = winners.length > 0 ? potNum / winners.length : 0;

        allWeeklyGames.push({
          weekId,
          winners: winners.map(w => w.toLowerCase()),
          pot: potNum,
          payoutPerWinner,
          blockNumber: Number(log.blockNumber),
          contract: contract.name,
        });

        for (const winner of winners) {
          addWin(winner, 'weekly', payoutPerWinner, weekId, contract.name);
        }
      }
    } catch (err) {
      console.error(`  Error fetching weekly logs: ${err.message}`);
    }
  }

  // Sort games by block number
  allDailyGames.sort((a, b) => a.blockNumber - b.blockNumber);
  allWeeklyGames.sort((a, b) => a.blockNumber - b.blockNumber);

  console.log('');
  console.log('====================================================================================================');
  console.log('DAILY GAMES HISTORY');
  console.log('====================================================================================================');

  allDailyGames.forEach((game, index) => {
    console.log(`\nDAILY GAME ${game.gameId} (Block ${game.blockNumber}) - ${game.contract}`);
    console.log(`  Pot: ${game.pot.toFixed(1)} VMF, Winners: ${game.winners.length}, Payout: ${game.payoutPerWinner.toFixed(1)} VMF each`);
    game.winners.forEach((w, i) => {
      console.log(`    ${i+1}. ${w}`);
    });
  });

  console.log('');
  console.log('====================================================================================================');
  console.log('WEEKLY GAMES HISTORY');
  console.log('====================================================================================================');

  allWeeklyGames.forEach((game, index) => {
    console.log(`\nWEEKLY ${game.weekId} (Block ${game.blockNumber}) - ${game.contract}`);
    console.log(`  Pot: ${game.pot.toFixed(1)} VMF, Winners: ${game.winners.length}, Payout: ${game.payoutPerWinner.toFixed(1)} VMF each`);
    game.winners.forEach((w, i) => {
      console.log(`    ${i+1}. ${w}`);
    });
  });

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
  console.log('COMPLETE PLAYER LEADERBOARD - ALL TIME');
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
  console.log('Total Daily Games Settled:', allDailyGames.length);
  console.log('Total Weekly Games Settled:', allWeeklyGames.length);
  console.log('Total Unique Winners:', results.length);
  console.log('Total Daily Wins:', results.reduce((sum, r) => sum + r.dailyWins, 0));
  console.log('Total Weekly Wins:', results.reduce((sum, r) => sum + r.weeklyWins, 0));
  console.log('Total VMF Distributed:', results.reduce((sum, r) => sum + r.totalVmfWon, 0).toFixed(1));
  console.log('====================================================================================================');
}

main().catch(console.error);
