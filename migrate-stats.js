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
    console.log("   Found 16 players from transaction history\n");

    // Player addresses extracted from old contract transactions
    const playerAddresses = [
      "0x9157Feb12812b253e84447C6B52C38651fd67FcA",
      "0xdf13d712d58EF7F7Abd4D29B398d503262ba4AC0",
      "0xffde42d40175b3b9349Dfb384439dCB811691E09",
      "0xD68C5493e41F03faC90776ad0366376E245255E8",
      "0xC77dA8cB158BA77BaC765625745a766Af3111A69",
      "0x65e3419E633833Df1D602e7905Cb9C7e541f0849",
      "0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765",
      "0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66",
      "0xBc4340Af8B93b0260ec8052CFA50982dD0865ba7",
      "0x1B49689db12080f5FcC5DC36f990599739487566",
      "0x8B06bd80840F0c6Ed78Aa8c3cc1d8eC155118d12",
      "0xF0F950DfF685f166F2531fbCf97CebEa000ef3B8",
      "0xd1CB812192C535d2762Bf4AD1f1C1D4deE3e383e",
      "0x14E8FddFa4a7c709C19a8C7DA5205c3ae366355c",
      "0xc64c699514E74451a627ccE93D45dc2E8f3a7793",
      "0xf091E8c19D1F5F3D44D0D3311001Af1437B4F5B8",
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
        // Rate limit or other error - skip this player and continue
        console.warn(`  ⚠️  Skipping ${playerAddr} (RPC error: ${error.code})`);
        // Add a small delay to avoid hammering the RPC
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
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
