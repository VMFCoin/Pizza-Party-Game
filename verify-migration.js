const { ethers } = require("ethers");

const NEW_CONTRACT_ADDRESS = "0xC24449caEf85f2abEdB879be5e0b1e5864839D73";
const PIZZA_PARTY_ABI = [
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

const playerAddresses = [
  "0x9157feb12812b253e84447c6b52c38651fd67fca",
  "0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765",
  "0x65e3419e633833df1d602e7905cb9c7e541f0849",
  "0xd68c5493e41f03fac90776ad0366376e245255e8",
  "0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0",
  "0x257cbe89968495c3ae8c81bccb8be7f257cd5f66",
  "0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b",
  "0xc77da8cb158ba77bac765625745a766af3111a69",
  "0x1b49689db12080f5fcc5dc36f990599739487566",
  "0xffde42d40175b3b9349dfb384439dcb811691e09",
  "0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546",
  "0xf0f950dff685f166f2531fbcf97cebea000ef3b8",
  "0xbc4340af8b93b0260ec8052cfa50982dd0865ba7",
  "0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c",
  "0x194fee25b9fb539e105fe13c53bff4ee46adc7cc",
  "0x944fa0f3f2168d4b27110f7f97972ad9425c4f52",
  "0xd1cb812192c535d2762bf4ad1f1c1d4dee3e383e",
  "0x8b06bd80840f0c6ed78aa8c3cc1d8ec155118d12",
];

async function verifyMigration() {
  try {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const contract = new ethers.Contract(NEW_CONTRACT_ADDRESS, PIZZA_PARTY_ABI, provider);

    console.log("✅ Verifying migration on new contract...\n");
    console.log(`Contract: ${NEW_CONTRACT_ADDRESS}\n`);

    let successCount = 0;
    let totalDailyWins = 0n;
    let totalWeeklyWins = 0n;
    let totalVmf = 0n;

    for (let i = 0; i < playerAddresses.length; i++) {
      const player = playerAddresses[i];
      let stats = null;

      try {
        stats = await contract.getPlayerLifetimeStats(player);
      } catch (error) {
        // Retry once with delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          stats = await contract.getPlayerLifetimeStats(player);
        } catch (retryError) {
          console.log(`${i + 1}. ✗ ${player} - Error: ${retryError.message.substring(0, 60)}`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
      }

      if (stats && (stats.totalDailyWins > 0n || stats.totalWeeklyWins > 0n || stats.totalVmfWon > 0n)) {
        successCount++;
        totalDailyWins += stats.totalDailyWins;
        totalWeeklyWins += stats.totalWeeklyWins;
        totalVmf += stats.totalVmfWon;

        const vmfFormatted = ethers.formatEther(stats.totalVmfWon);
        console.log(`${i + 1}. ✓ ${player}`);
        console.log(`   Daily: ${stats.totalDailyWins}, Weekly: ${stats.totalWeeklyWins}, VMF: ${vmfFormatted}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`\n✅ Migration Verification Results:\n`);
    console.log(`  Total players verified: ${successCount}/${playerAddresses.length}`);
    console.log(`  Total daily wins: ${totalDailyWins}`);
    console.log(`  Total weekly wins: ${totalWeeklyWins}`);
    console.log(`  Total VMF: ${ethers.formatEther(totalVmf)} VMF`);

    if (successCount === playerAddresses.length) {
      console.log(`\n🎉 SUCCESS! All ${playerAddresses.length} players' stats are on the new contract!\n`);
    } else {
      console.log(`\n⚠️  Only ${successCount} of ${playerAddresses.length} players verified.\n`);
    }

  } catch (error) {
    console.error("Error:", error.message);
  }
}

verifyMigration();
