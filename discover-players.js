/**
 * Script to discover all player addresses from the old PizzaParty contract
 * by querying DailyGameEntered events
 *
 * Usage:
 * export BASE_RPC_URL=https://mainnet.base.org
 * node discover-players.js
 */

const { ethers } = require("ethers");

// ========== CONFIGURATION ==========
const OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7";
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Minimal ABI to get DailyGameEntered events
const EVENT_ABI = [
  "event DailyGameEntered(uint256 indexed gameId, address indexed player, bool isFirst, uint256 amount)"
];

async function discoverPlayers() {
  console.log("🔍 Discovering all players from old contract events\n");
  console.log(`📋 Contract: ${OLD_CONTRACT_ADDRESS}`);
  console.log(`📡 RPC: ${RPC_URL}\n`);

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Create contract instance for event parsing
    const contract = new ethers.Contract(
      OLD_CONTRACT_ADDRESS,
      EVENT_ABI,
      provider
    );

    // Get the current block number to estimate range
    const currentBlock = await provider.getBlockNumber();
    console.log(`📊 Current block: ${currentBlock}`);
    console.log(`⏳ Querying events (this may take a minute)...\n`);

    // Query events in chunks to avoid rate limiting
    // We'll query from deployment to current in 50k block chunks
    const chunkSize = 50000;
    const players = new Set();
    let totalEvents = 0;

    // Estimate start block (roughly when contract was deployed)
    // Based on the context, contract seems recent - start from a reasonable block
    const startBlock = currentBlock - 500000; // Adjust if needed based on contract age

    for (let fromBlock = Math.max(0, startBlock); fromBlock < currentBlock; fromBlock += chunkSize) {
      const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);

      try {
        console.log(`  📍 Querying blocks ${fromBlock} to ${toBlock}...`);

        const logs = await provider.getLogs({
          address: OLD_CONTRACT_ADDRESS,
          topics: [ethers.id("DailyGameEntered(uint256,address,bool,uint256)")],
          fromBlock,
          toBlock
        });

        console.log(`     Found ${logs.length} events in this range`);
        totalEvents += logs.length;

        // Parse each log to extract player address
        for (const log of logs) {
          try {
            // DailyGameEntered has player as indexed param at position 2 (after gameId at 1)
            // topics[2] contains the address in the top 160 bits
            const playerAddress = "0x" + log.topics[2].slice(-40);

            // Validate it's a valid address
            try {
              const checksummed = ethers.getAddress(playerAddress);
              players.add(checksummed);
            } catch (e) {
              console.warn(`    ⚠️  Invalid address extracted: ${playerAddress}`);
            }
          } catch (error) {
            console.warn(`    ⚠️  Error parsing event: ${error.message}`);
          }
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        if (error.code === "RATE_LIMIT_EXCEEDED") {
          console.warn(`    ⚠️  Rate limited, waiting 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          // Retry this block range
          fromBlock -= chunkSize;
        } else {
          console.warn(`    ⚠️  Error querying blocks ${fromBlock}-${toBlock}: ${error.message}`);
        }
      }
    }

    console.log(`\n✅ Discovery complete!\n`);
    console.log(`📊 Statistics:`);
    console.log(`  • Total events found: ${totalEvents}`);
    console.log(`  • Unique players: ${players.size}\n`);

    console.log(`📋 Player Addresses (sorted):\n`);
    const playerList = Array.from(players).sort();
    playerList.forEach((addr, idx) => {
      console.log(`  ${idx + 1}. ${addr}`);
    });

    console.log(`\n📝 Copy-paste ready list for migrate-stats.js:\n`);
    console.log("const playerAddresses = [");
    playerList.forEach((addr, idx) => {
      const comma = idx < playerList.length - 1 ? "," : "";
      console.log(`  "${addr}"${comma}`);
    });
    console.log("];");

    console.log(`\n💾 Save this list to update migrate-stats.js playerAddresses array`);
  } catch (error) {
    console.error("❌ Error during discovery:", error);
    process.exit(1);
  }
}

discoverPlayers();
