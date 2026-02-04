const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');

// ALL FOUR Pizza Party contracts in chronological order
const CONTRACTS = [
  { address: '0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7', name: 'ORIGINAL (First Live Deployment)' },
  { address: '0xC24449caEf85f2abEdB879be5e0b1e5864839D73', name: 'SECOND (Games 1-10, Weekly 1)' },
  { address: '0x5c3aaD450F0014292Ff363b2147e6571b16c8035', name: 'THIRD (Games 11-12, Weekly 2)' },
  { address: '0x10BEB7B8495E7daeAB06C2e10e77251FD9429adB', name: 'CURRENT (Game 13+, Weekly 3+)' },
];

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

// All known players
const KNOWN_PLAYERS = [
  '0x9157Feb12812b253e84447C6B52C38651fd67FcA',
  '0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66',
  '0x12e31f706010AE0996A2D8247c432d9102e3c871',
  '0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765',
  '0xc77da8cb158ba77bac765625745a766af3111a69',
  '0xffde42d40175b3b9349dfb384439dcb811691e09',
  '0xd68c5493e41f03fac90776ad0366376e245255e8',
  '0x1b49689db12080f5fcc5dc36f990599739487566',
  '0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c',
  '0x802f18765d6945b82075241e40b6214331ca3641',
  '0x86e36c9ba3c6a2542fd761bc2b4fd61a110ea6cd',
  '0x65e3419e633833df1d602e7905cb9c7e541f0849',
  '0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0',
  '0x46e9beef5dc68dff095eca56dadf90247f1af7ef',
  '0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546',
  '0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b',
  '0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC',
];

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
});

async function getStatsFromContract(contractAddress, contractName, players) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`${contractName}`);
  console.log(`Address: ${contractAddress}`);
  console.log('='.repeat(100));

  const results = [];

  for (const player of players) {
    try {
      const stats = await client.readContract({
        address: contractAddress,
        abi: ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [player],
      });

      const dailyWins = Number(stats.totalDailyWins);
      const weeklyWins = Number(stats.totalWeeklyWins);
      const vmfWon = formatUnits(stats.totalVmfWon, 18);
      const toppings = Number(stats.lifetimeToppings);
      const referrals = Number(stats.lifetimeReferrals);

      if (dailyWins > 0 || weeklyWins > 0 || parseFloat(vmfWon) > 0 || toppings > 0) {
        results.push({
          address: player.toLowerCase(),
          dailyWins,
          weeklyWins,
          totalWins: dailyWins + weeklyWins,
          vmfWon: parseFloat(vmfWon).toFixed(1),
          toppings,
          referrals,
        });
      }
    } catch (err) {
      // Contract might not have this function or player doesn't exist
    }
  }

  // Sort by total wins desc
  results.sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return parseFloat(b.vmfWon) - parseFloat(a.vmfWon);
  });

  if (results.length === 0) {
    console.log('No stats found in this contract.');
  } else {
    console.log('RANK | ADDRESS                                      | DAILY | WEEKLY | TOTAL | VMF WON    | TOPPINGS | REFERRALS');
    console.log('-----|----------------------------------------------+-------+--------+-------+------------+----------+----------');
    results.forEach((r, i) => {
      const rank = String(i+1).padStart(4);
      const daily = String(r.dailyWins).padStart(5);
      const weekly = String(r.weeklyWins).padStart(6);
      const total = String(r.totalWins).padStart(5);
      const vmf = r.vmfWon.padStart(10);
      const topp = String(r.toppings).padStart(8);
      const refs = String(r.referrals).padStart(9);
      console.log(rank + ' | ' + r.address + ' | ' + daily + ' | ' + weekly + ' | ' + total + ' | ' + vmf + ' | ' + topp + ' | ' + refs);
    });
  }

  return results;
}

async function main() {
  console.log('='.repeat(100));
  console.log('QUERYING ALL FOUR PIZZA PARTY CONTRACTS FOR COMPLETE LIFETIME STATS');
  console.log('='.repeat(100));

  const allContractStats = [];

  // Get stats from all four contracts
  for (const contract of CONTRACTS) {
    const stats = await getStatsFromContract(contract.address, contract.name, KNOWN_PLAYERS);
    allContractStats.push({ contract, stats });
  }

  // Combine all stats
  const combinedStats = new Map();

  for (const { contract, stats } of allContractStats) {
    for (const s of stats) {
      const addr = s.address.toLowerCase();
      if (!combinedStats.has(addr)) {
        combinedStats.set(addr, {
          address: addr,
          dailyWins: 0,
          weeklyWins: 0,
          vmfWon: 0,
          toppings: 0,
          referrals: 0,
          sources: [],
        });
      }
      const existing = combinedStats.get(addr);
      existing.dailyWins += s.dailyWins;
      existing.weeklyWins += s.weeklyWins;
      existing.vmfWon += parseFloat(s.vmfWon);
      existing.toppings += s.toppings;
      existing.referrals += s.referrals;
      existing.sources.push(contract.name.split(' ')[0]);
    }
  }

  // Convert to array and sort
  const combined = Array.from(combinedStats.values());
  combined.sort((a, b) => {
    const totalA = a.dailyWins + a.weeklyWins;
    const totalB = b.dailyWins + b.weeklyWins;
    if (totalB !== totalA) return totalB - totalA;
    return b.vmfWon - a.vmfWon;
  });

  console.log('\n' + '='.repeat(100));
  console.log('COMBINED LIFETIME STATS FROM ALL FOUR CONTRACTS - FULL MIGRATION LIST');
  console.log('='.repeat(100));
  console.log('');
  console.log('RANK | ADDRESS                                      | DAILY | WEEKLY | TOTAL | VMF WON    | TOPPINGS | REFERRALS');
  console.log('-----|----------------------------------------------+-------+--------+-------+------------+----------+----------');

  combined.forEach((r, i) => {
    const rank = String(i+1).padStart(4);
    const daily = String(r.dailyWins).padStart(5);
    const weekly = String(r.weeklyWins).padStart(6);
    const total = String(r.dailyWins + r.weeklyWins).padStart(5);
    const vmf = r.vmfWon.toFixed(1).padStart(10);
    const topp = String(r.toppings).padStart(8);
    const refs = String(r.referrals).padStart(9);
    console.log(rank + ' | ' + r.address + ' | ' + daily + ' | ' + weekly + ' | ' + total + ' | ' + vmf + ' | ' + topp + ' | ' + refs);
  });

  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log('Total Unique Players:', combined.length);
  console.log('Total Daily Wins:', combined.reduce((sum, r) => sum + r.dailyWins, 0));
  console.log('Total Weekly Wins:', combined.reduce((sum, r) => sum + r.weeklyWins, 0));
  console.log('Total VMF Won:', combined.reduce((sum, r) => sum + r.vmfWon, 0).toFixed(1));
  console.log('Total Toppings:', combined.reduce((sum, r) => sum + r.toppings, 0));
  console.log('Total Referrals:', combined.reduce((sum, r) => sum + r.referrals, 0));
  console.log('='.repeat(100));

  // Output in a format ready for migration
  console.log('\n' + '='.repeat(100));
  console.log('MIGRATION DATA (Copy-Paste Ready)');
  console.log('='.repeat(100));
  console.log('\naddresses = [');
  combined.forEach(r => console.log(`  "${r.address}",`));
  console.log(']');
  console.log('\ndailyWins = [' + combined.map(r => r.dailyWins).join(', ') + ']');
  console.log('weeklyWins = [' + combined.map(r => r.weeklyWins).join(', ') + ']');
  console.log('vmfWon = [' + combined.map(r => r.vmfWon.toFixed(1)).join(', ') + ']');
  console.log('toppings = [' + combined.map(r => r.toppings).join(', ') + ']');
  console.log('referrals = [' + combined.map(r => r.referrals).join(', ') + ']');
}

main().catch(console.error);
