const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');

const OLD_CONTRACT = '0x5c3aaD450F0014292Ff363b2147e6571b16c8035';

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

// Known players from CSV transaction data (Games 1-12 + Weekly 1-2)
const PLAYERS = [
  '0xc77da8cb158ba77bac765625745a766af3111a69',
  '0xffde42d40175b3b9349dfb384439dcb811691e09',
  '0xd68c5493e41f03fac90776ad0366376e245255e8',
  '0x1b49689db12080f5fcc5dc36f990599739487566',
  '0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c',
  '0x802f18765d6945b82075241e40b6214331ca3641',
  '0x86e36c9ba3c6a2542fd761bc2b4fd61a110ea6cd',
  '0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765',
  '0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546',
  '0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b',
  '0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0',
  '0x257cbe89968495c3ae8c81bccb8be7f257cd5f66',
  '0x65e3419e633833df1d602e7905cb9c7e541f0849',
  '0x12e31f706010ae0996a2d8247c432d9102e3c871',
  '0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC',
];

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
});

async function main() {
  console.log('====================================================================================================');
  console.log('COMPLETE PLAYER STATS FROM GAME 1 TO CURRENT (Old Contract: 0x5c3aaD450F...8035)');
  console.log('====================================================================================================');
  console.log('');

  const results = [];

  for (const player of PLAYERS) {
    try {
      const stats = await client.readContract({
        address: OLD_CONTRACT,
        abi: ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [player],
      });

      const dailyWins = Number(stats.totalDailyWins);
      const weeklyWins = Number(stats.totalWeeklyWins);
      const vmfWon = formatUnits(stats.totalVmfWon, 18);
      const toppings = Number(stats.lifetimeToppings);

      results.push({
        address: player,
        dailyWins,
        weeklyWins,
        totalWins: dailyWins + weeklyWins,
        vmfWon: parseFloat(vmfWon).toFixed(1),
        toppings,
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

  console.log('RANK | ADDRESS                                      | DAILY | WEEKLY | TOTAL | VMF WON    | TOPPINGS');
  console.log('-----|----------------------------------------------+-------+--------+-------+------------+----------');

  results.forEach((r, i) => {
    const rank = String(i+1).padStart(4);
    const daily = String(r.dailyWins).padStart(5);
    const weekly = String(r.weeklyWins).padStart(6);
    const total = String(r.totalWins).padStart(5);
    const vmf = r.vmfWon.padStart(10);
    const topp = String(r.toppings).padStart(8);
    console.log(rank + ' | ' + r.address + ' | ' + daily + ' | ' + weekly + ' | ' + total + ' | ' + vmf + ' | ' + topp);
  });

  console.log('');
  console.log('====================================================================================================');
  console.log('Total players with stats:', results.filter(r => r.totalWins > 0 || parseFloat(r.vmfWon) > 0).length);
  console.log('====================================================================================================');
}

main().catch(console.error);
