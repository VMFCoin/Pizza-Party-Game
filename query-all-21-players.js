/**
 * Query stats for ALL 21 players found in complete CSV export
 * Run this locally: node query-all-21-players.js
 */

const { ethers } = require("ethers");

const OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7";
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// All 21 unique player addresses from complete CSV export (Nov 21 - Dec 2)
const ALL_PLAYERS = [
  "0x108608f3f993bfd55fab50d9ef1a5c7e2c47f29b",
  "0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c",
  "0x194fee25b9fb539e105fe13c53bff4ee46adc7cc",
  "0x1b49689db12080f5fcc5dc36f990599739487566",
  "0x1d1a865ba497ace603b084161f5835074d531285",
  "0x257cbe89968495c3ae8c81bccb8be7f257cd5f66",
  "0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765",
  "0x65e3419e633833df1d602e7905cb9c7e541f0849",
  "0x7e2dab6404b71e979829b25715e32e8a3daac422",
  "0x8b06bd80840f0c6ed78aa8c3cc1d8ec155118d12",
  "0x9157feb12812b253e84447c6b52c38651fd67fca",
  "0x944fa0f3f2168d4b27110f7f97972ad9425c4f52",
  "0xacbf90a3f03a34faa8235854ca6c3ee0cc8c7546",
  "0xbc4340af8b93b0260ec8052cfa50982dd0865ba7",
  "0xc64c699514e74451a627cce93d45dc2e8f3a7793",
  "0xc77da8cb158ba77bac765625745a766af3111a69",
  "0xd1cb812192c535d2762bf4ad1f1c1d4dee3e383e",
  "0xd68c5493e41f03fac90776ad0366376e245255e8",
  "0xdf13d712d58ef7f7abd4d29b398d503262ba4ac0",
  "0xf0f950dff685f166f2531fbcf97cebea000ef3b8",
  "0xffde42d40175b3b9349dfb384439dcb811691e09",
];

const PIZZA_PARTY_ABI = [
  {
    type: "function",
    name: "getPlayerLifetimeStats",
    stateMutability: "view",
    inputs: [{ type: "address", name: "player" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "uint256", name: "totalDailyWins" },
          { type: "uint256", name: "totalWeeklyWins" },
          { type: "uint256", name: "totalVmfWon" },
          { type: "uint256", name: "lifetimeToppings" },
          { type: "uint256", name: "lifetimeReferrals" },
        ],
      },
    ],
  },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(contract, address, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const stats = await contract.getPlayerLifetimeStats(address);
      return stats;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`    ⚠️  Retry ${i + 1}/${maxRetries}...`);
      await sleep(2000);
    }
  }
}

async function queryAllPlayers() {
  console.log("🔍 Querying stats for ALL 21 players from complete CSV...\n");
  console.log(`📋 Old Contract: ${OLD_CONTRACT_ADDRESS}`);
  console.log(`📡 RPC: ${RPC_URL}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    OLD_CONTRACT_ADDRESS,
    PIZZA_PARTY_ABI,
    provider
  );

  console.log("📊 Querying stats...\n");

  const playersWithStats = [];
  const playersWithoutStats = [];

  for (let i = 0; i < ALL_PLAYERS.length; i++) {
    const address = ALL_PLAYERS[i];
    process.stdout.write(
      `   [${i + 1}/${ALL_PLAYERS.length}] ${address} ... `
    );

    try {
      const stats = await queryWithRetry(contract, address);

      const hasStats =
        stats.totalDailyWins > 0n ||
        stats.totalWeeklyWins > 0n ||
        stats.totalVmfWon > 0n;

      if (hasStats) {
        const playerData = {
          address,
          dailyWins: Number(stats.totalDailyWins),
          weeklyWins: Number(stats.totalWeeklyWins),
          vmfWon: Number(ethers.formatEther(stats.totalVmfWon)),
          toppings: Number(stats.lifetimeToppings),
          referrals: Number(stats.lifetimeReferrals),
        };
        playersWithStats.push(playerData);
        console.log(
          `✓ (D:${playerData.dailyWins} W:${playerData.weeklyWins} V:${playerData.vmfWon})`
        );
      } else {
        playersWithoutStats.push(address);
        console.log("⊘ (no stats)");
      }

      await sleep(1500); // Delay to avoid rate limiting
    } catch (error) {
      console.log(`✗ Error: ${error.code || error.message}`);
      playersWithoutStats.push(address);
    }
  }

  // Display results
  console.log("\n" + "=".repeat(80));
  console.log("\n📊 FINAL RESULTS:\n");
  console.log(`  Total addresses checked: ${ALL_PLAYERS.length}`);
  console.log(`  Players with stats: ${playersWithStats.length}`);
  console.log(`  Players without stats: ${playersWithoutStats.length}`);
  console.log(
    `  Total daily wins: ${playersWithStats.reduce((sum, p) => sum + p.dailyWins, 0)}`
  );
  console.log(
    `  Total weekly wins: ${playersWithStats.reduce((sum, p) => sum + p.weeklyWins, 0)}`
  );
  console.log(
    `  Total VMF won: ${playersWithStats.reduce((sum, p) => sum + p.vmfWon, 0).toFixed(3)} VMF`
  );

  console.log("\n📋 All Players with Stats:\n");
  playersWithStats
    .sort((a, b) => b.vmfWon - a.vmfWon)
    .forEach((p, i) => {
      console.log(`${i + 1}. ${p.address}`);
      console.log(
        `   Daily: ${p.dailyWins}, Weekly: ${p.weeklyWins}, VMF: ${p.vmfWon}, Toppings: ${p.toppings}, Referrals: ${p.referrals}\n`
      );
    });

  if (playersWithoutStats.length > 0) {
    console.log("\n⊘ Players without recorded stats:");
    playersWithoutStats.forEach((addr) => console.log(`   ${addr}`));
  }

  console.log("\n" + "=".repeat(80));
  console.log("\n📝 COPY THIS FOR MIGRATION SCRIPT:\n");
  console.log("const playerAddresses = [");
  playersWithStats.forEach((p) => {
    console.log(`  "${p.address}",`);
  });
  console.log("];\n");

  console.log(
    `✅ Found ${playersWithStats.length} players ready for migration!\n`
  );
  console.log("=".repeat(80));
}

queryAllPlayers().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
