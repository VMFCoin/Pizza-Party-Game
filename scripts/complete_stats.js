/**
 * COMPLETE PLAYER STATS FROM GAME 1 TO CURRENT
 *
 * This script compiles all known winners from:
 * - Old Contract (0x5c3aaD450F0014292Ff363b2147e6571b16c8035): Games 11-12 + Weekly 2
 * - New Contract (0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB): Game 13+ (in progress)
 *
 * Note: Games 1-10 and Weekly 1 were on earlier contract versions.
 * The on-chain getPlayerLifetimeStats from the old contract captures the totals.
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');

const OLD_CONTRACT = '0x5c3aaD450F0014292Ff363b2147e6571b16c8035';
const NEW_CONTRACT = '0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB';

const ABI = [
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

// All known players from on-chain events + Weekly 2 settlement
const PLAYERS = [
  // Daily Game 11 winners (Game 1 in old contract)
  '0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765',
  '0xc77da8cb158ba77bac765625745a766af3111a69',
  '0x65e3419e633833df1d602e7905cb9c7e541f0849',
  '0xffde42d40175b3b9349dfb384439dcb811691e09',
  '0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0',
  '0x46e9beef5dc68dff095eca56dadf90247f1af7ef',
  '0xd68c5493e41f03fac90776ad0366376e245255e8',
  '0x9157feb12812b253e84447c6b52c38651fd67fca',
  // Daily Game 12 winners (Game 2 in old contract)
  '0x1b49689db12080f5fcc5dc36f990599739487566',
  '0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c',
  '0x802f18765d6945b82075241e40b6214331ca3641',
  '0x86e36c9ba3c6a2542fd761bc2b4fd61a110ea6cd',
  // Weekly 2 winners (from tx 0xf1e890ad...)
  '0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546',
  '0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b',
  '0x257cbe89968495c3ae8c81bccb8be7f257cd5f66',
  '0x12e31f706010ae0996a2d8247c432d9102e3c871',
  // Owner wallet (may have played)
  '0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC',
];

// Weekly 2 winners (decoded from settlement tx 0xf1e890ad in block 38915185)
// 10 winners, 91 VMF pot = 9.1 VMF each
const WEEKLY_2_WINNERS = [
  '0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546',
  '0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b',
  '0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0',
  '0x1b49689db12080f5fcc5dc36f990599739487566',
  '0x257cbe89968495c3ae8c81bccb8be7f257cd5f66',
  '0xc77da8cb158ba77bac765625745a766af3111a69',
  '0xffde42d40175b3b9349dfb384439dcb811691e09',
  '0x65e3419e633833df1d602e7905cb9c7e541f0849',
  '0xd68c5493e41f03fac90776ad0366376e245255e8',
  '0x12e31f706010ae0996a2d8247c432d9102e3c871',
];

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
});

async function main() {
  console.log('====================================================================================================');
  console.log('COMPLETE PLAYER STATS FROM GAME 1 TO CURRENT');
  console.log('====================================================================================================');
  console.log('');
  console.log('Data Sources:');
  console.log('  - Old Contract (0x5c3aaD450F...8035): Lifetime stats from Games 11-12 + Weekly 2');
  console.log('  - New Contract (0x10BEB7B8...adB): Game 13+ (currently in progress)');
  console.log('');

  const results = [];
  const uniqueAddresses = [...new Set(PLAYERS.map(a => a.toLowerCase()))];

  // Check if address won Weekly 2
  const weekly2Set = new Set(WEEKLY_2_WINNERS.map(a => a.toLowerCase()));

  for (const player of uniqueAddresses) {
    try {
      // Get stats from old contract
      const oldStats = await client.readContract({
        address: OLD_CONTRACT,
        abi: ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [player],
      });

      // Get stats from new contract
      let newStats = { totalDailyWins: 0n, totalWeeklyWins: 0n, totalVmfWon: 0n };
      try {
        newStats = await client.readContract({
          address: NEW_CONTRACT,
          abi: ABI,
          functionName: 'getPlayerLifetimeStats',
          args: [player],
        });
      } catch (e) {
        // New contract may not have stats for this player yet
      }

      const dailyWins = Number(oldStats.totalDailyWins) + Number(newStats.totalDailyWins);
      const weeklyWins = Number(oldStats.totalWeeklyWins) + Number(newStats.totalWeeklyWins);
      const vmfWon = formatUnits(oldStats.totalVmfWon + newStats.totalVmfWon, 18);
      const toppings = Number(oldStats.lifetimeToppings);

      // Note if they won Weekly 2
      const wonWeekly2 = weekly2Set.has(player);

      results.push({
        address: player,
        dailyWins,
        weeklyWins,
        totalWins: dailyWins + weeklyWins,
        vmfWon: parseFloat(vmfWon).toFixed(1),
        toppings,
        wonWeekly2,
      });
    } catch (err) {
      console.error('Error for', player, err.message);
    }
  }

  // Sort by total wins (desc), then VMF won (desc)
  results.sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return parseFloat(b.vmfWon) - parseFloat(a.vmfWon);
  });

  console.log('====================================================================================================');
  console.log('PLAYER LEADERBOARD (LIFETIME STATS FROM ON-CHAIN DATA)');
  console.log('====================================================================================================');
  console.log('');
  console.log('RANK | ADDRESS                                      | DAILY | WEEKLY | TOTAL | VMF WON    | TOPPINGS | W2');
  console.log('-----|----------------------------------------------+-------+--------+-------+------------+----------+----');

  results.forEach((r, i) => {
    const rank = String(i+1).padStart(4);
    const daily = String(r.dailyWins).padStart(5);
    const weekly = String(r.weeklyWins).padStart(6);
    const total = String(r.totalWins).padStart(5);
    const vmf = r.vmfWon.padStart(10);
    const topp = String(r.toppings).padStart(8);
    const w2 = r.wonWeekly2 ? ' ✓ ' : '   ';
    console.log(rank + ' | ' + r.address + ' | ' + daily + ' | ' + weekly + ' | ' + total + ' | ' + vmf + ' | ' + topp + ' |' + w2);
  });

  console.log('');
  console.log('Legend: W2 = Won Weekly 2 (9.1 VMF)');
  console.log('');
  console.log('====================================================================================================');
  console.log('SUMMARY');
  console.log('====================================================================================================');
  console.log('Total Unique Players with Stats:', results.filter(r => r.totalWins > 0 || parseFloat(r.vmfWon) > 0).length);
  console.log('Total Daily Wins:', results.reduce((sum, r) => sum + r.dailyWins, 0));
  console.log('Total Weekly Wins:', results.reduce((sum, r) => sum + r.weeklyWins, 0));
  console.log('Total VMF Won:', results.reduce((sum, r) => sum + parseFloat(r.vmfWon), 0).toFixed(1));
  console.log('Weekly 2 Winners:', WEEKLY_2_WINNERS.length);
  console.log('====================================================================================================');

  console.log('');
  console.log('====================================================================================================');
  console.log('GAME-BY-GAME BREAKDOWN');
  console.log('====================================================================================================');
  console.log('');
  console.log('DAILY GAME 11 (Block 39001335) - 8 winners, pot = 892.1 VMF, payout = 104.8 VMF each');
  console.log('  1. 0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765');
  console.log('  2. 0xc77da8cb158ba77bac765625745a766af3111a69');
  console.log('  3. 0x65e3419e633833df1d602e7905cb9c7e541f0849');
  console.log('  4. 0xffde42d40175b3b9349dfb384439dcb811691e09');
  console.log('  5. 0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0');
  console.log('  6. 0x46e9beef5dc68dff095eca56dadf90247f1af7ef');
  console.log('  7. 0xd68c5493e41f03fac90776ad0366376e245255e8');
  console.log('  8. 0x9157feb12812b253e84447c6b52c38651fd67fca');
  console.log('');
  console.log('DAILY GAME 12 (Block 39044534) - 8 winners, pot = 1096.3 VMF, payout = 128.8 VMF each');
  console.log('  1. 0xc77da8cb158ba77bac765625745a766af3111a69');
  console.log('  2. 0xd68c5493e41f03fac90776ad0366376e245255e8');
  console.log('  3. 0x1b49689db12080f5fcc5dc36f990599739487566');
  console.log('  4. 0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c');
  console.log('  5. 0x802f18765d6945b82075241e40b6214331ca3641');
  console.log('  6. 0xffde42d40175b3b9349dfb384439dcb811691e09');
  console.log('  7. 0x86e36c9ba3c6a2542fd761bc2b4fd61a110ea6cd');
  console.log('  8. 0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765');
  console.log('');
  console.log('WEEKLY 2 (Block 38915185, tx 0xf1e890ad...) - 10 winners, pot = 91 VMF, payout = 9.1 VMF each');
  WEEKLY_2_WINNERS.forEach((w, i) => {
    console.log('  ' + (i+1) + '. ' + w);
  });
  console.log('');
  console.log('====================================================================================================');
  console.log('NOTE: Games 1-10 and Weekly 1 were on earlier contract versions.');
  console.log('The lifetime stats above only reflect what\'s stored in the old contract (Games 11-12 + Weekly 2).');
  console.log('====================================================================================================');
}

main().catch(console.error);
