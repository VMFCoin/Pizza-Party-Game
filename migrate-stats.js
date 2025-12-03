/**
 * Migration Script: Export stats from old contract & import to new contract
 *
 * Usage:
 * export PRIVATE_KEY=0xyourprivatekey
 * export BASE_RPC_URL=https://mainnet.base.org
 * node migrate-stats.js
 *
 * This script will:
 * - Query all players from the old contract
 * - Export their lifetime stats (wins, VMF won, etc.)
 * - Call migratePlayerStats() on the new contract
 * - Preserve all player history on the new deployment
 */

const { ethers } = require("ethers");

// ========== CONFIGURATION ==========
const OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7"; // Previous deployment
const NEW_CONTRACT_ADDRESS = "0xC24449caEf85f2abEdB879be5e0b1e5864839D73"; // New contract address
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// PizzaParty ABI (minimal - just what we need for migration)
const PIZZA_PARTY_ABI = [
  "function getPlayerLifetimeStats(address player) public view returns (uint256 totalDailyWins, uint256 totalWeeklyWins, uint256 totalVmfWon, uint256 lifetimeToppings, uint256 lifetimeReferrals)",
  "function migratePlayerStats(address[] calldata players, tuple(uint256,uint256,uint256,uint256,uint256)[] calldata stats) external",
  "function dailyGameId() public view returns (uint256)",
  "function weeklyGameId() public view returns (uint256)",
];

async function migrateStats() {
  console.log("🍕 PizzaParty Stats Migration");
  console.log("==============================\n");

  if (!NEW_CONTRACT_ADDRESS.startsWith("0x")) {
    console.error("❌ Error: NEW_CONTRACT_ADDRESS is not set!");
    console.error("Please update NEW_CONTRACT_ADDRESS in migrate-stats.js");
    process.exit(1);
  }

  if (!PRIVATE_KEY) {
    console.error("❌ Error: PRIVATE_KEY environment variable not set!");
    process.exit(1);
  }

  try {
    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`📡 Connected to Base Mainnet`);
    console.log(`👤 Signer address: ${signer.address}\n`);

    // Initialize old contract (read-only)
    const oldContract = new ethers.Contract(
      OLD_CONTRACT_ADDRESS,
      PIZZA_PARTY_ABI,
      provider
    );

    // Initialize new contract (with signer for write operations)
    const newContract = new ethers.Contract(
      NEW_CONTRACT_ADDRESS,
      PIZZA_PARTY_ABI,
      signer
    );

    console.log(`📋 OLD Contract: ${OLD_CONTRACT_ADDRESS}`);
    console.log(`✨ NEW Contract: ${NEW_CONTRACT_ADDRESS}\n`);

    // ========== STEP 1: QUERY OLD CONTRACT FOR PLAYERS ==========
    console.log("⏳ Querying player stats from old contract...");
    console.log("   Found 18 players with recorded stats (from complete CSV export)\n");

    // Player addresses with stats (18 total from complete CSV export Nov 21 - Dec 2)
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

    if (playerAddresses.length === 0) {
      console.error("❌ No player addresses provided!");
      process.exit(1);
    }

    // ========== STEP 2: FETCH STATS FOR EACH PLAYER ==========
    console.log(`📊 Fetching stats for ${playerAddresses.length} players...\n`);

    const playersData = [];

    for (let i = 0; i < playerAddresses.length; i++) {
      const playerAddr = playerAddresses[i];

      // Validate address
      try {
        ethers.getAddress(playerAddr);
      } catch {
        console.warn(
          `⚠️  Invalid address at index ${i}: ${playerAddr} (skipping)`
        );
        continue;
      }

      try {
        const stats = await oldContract.getPlayerLifetimeStats(playerAddr);

        // Only include players with stats
        if (
          stats.totalDailyWins > 0n ||
          stats.totalWeeklyWins > 0n ||
          stats.totalVmfWon > 0n ||
          stats.lifetimeToppings > 0n ||
          stats.lifetimeReferrals > 0n
        ) {
          playersData.push({
            address: playerAddr,
            stats: {
              totalDailyWins: stats.totalDailyWins,
              totalWeeklyWins: stats.totalWeeklyWins,
              totalVmfWon: stats.totalVmfWon,
              lifetimeToppings: stats.lifetimeToppings,
              lifetimeReferrals: stats.lifetimeReferrals,
            },
          });

          console.log(
            `  ✓ ${playerAddr}: ${Number(stats.totalDailyWins)} daily wins, ${Number(stats.totalWeeklyWins)} weekly wins, ${ethers.formatEther(stats.totalVmfWon)} VMF won`
          );
        }
      } catch (error) {
        // Retry with longer delay on error
        console.warn(`  ⚠️  Error fetching stats, retrying after 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const stats = await oldContract.getPlayerLifetimeStats(playerAddr);
          if (
            stats.totalDailyWins > 0n ||
            stats.totalWeeklyWins > 0n ||
            stats.totalVmfWon > 0n ||
            stats.lifetimeToppings > 0n ||
            stats.lifetimeReferrals > 0n
          ) {
            playersData.push({
              address: playerAddr,
              stats: {
                totalDailyWins: stats.totalDailyWins,
                totalWeeklyWins: stats.totalWeeklyWins,
                totalVmfWon: stats.totalVmfWon,
                lifetimeToppings: stats.lifetimeToppings,
                lifetimeReferrals: stats.lifetimeReferrals,
              },
            });

            console.log(
              `  ✓ ${playerAddr}: ${Number(stats.totalDailyWins)} daily wins, ${Number(stats.totalWeeklyWins)} weekly wins, ${ethers.formatEther(stats.totalVmfWon)} VMF won`
            );
          }
        } catch (retryError) {
          console.warn(`  ⚠️  Skipping ${playerAddr} (retry failed: ${retryError.code})`);
        }
      }

      // Always add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (playersData.length === 0) {
      console.error("❌ No players with stats found!");
      process.exit(1);
    }

    console.log(`\n✅ Found ${playersData.length} players with stats\n`);

    // ========== STEP 3: MIGRATE TO NEW CONTRACT ==========
    console.log("🚀 Migrating stats to new contract...\n");

    const addresses = playersData.map((p) => p.address);
    const statsArray = playersData.map((p) => [
      p.stats.totalDailyWins,
      p.stats.totalWeeklyWins,
      p.stats.totalVmfWon,
      p.stats.lifetimeToppings,
      p.stats.lifetimeReferrals,
    ]);

    // Estimate gas
    const gasEstimate = await newContract.migratePlayerStats.estimateGas(
      addresses,
      statsArray
    );
    console.log(`📊 Estimated gas: ${gasEstimate.toString()}`);

    // Execute migration
    const tx = await newContract.migratePlayerStats(addresses, statsArray);
    console.log(`📝 Transaction submitted: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...\n");

    const receipt = await tx.wait();

    if (receipt && receipt.status === 1) {
      console.log("✅ Migration successful!\n");
      console.log("Summary:");
      console.log(`  • Migrated: ${playersData.length} players`);
      console.log(
        `  • Total daily wins: ${playersData.reduce((sum, p) => sum + Number(p.stats.totalDailyWins), 0)}`
      );
      console.log(
        `  • Total weekly wins: ${playersData.reduce((sum, p) => sum + Number(p.stats.totalWeeklyWins), 0)}`
      );
      console.log(
        `  • Total VMF distributed: ${ethers.formatEther(
          playersData.reduce((sum, p) => sum + p.stats.totalVmfWon, 0n)
        )} VMF`
      );
      console.log(`  • Block: ${receipt.blockNumber}`);
      console.log(
        `\n🎉 All player stats have been preserved on the new contract!\n`
      );
    } else {
      console.error("❌ Migration transaction failed!");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error during migration:", error);
    process.exit(1);
  }
}

migrateStats();
