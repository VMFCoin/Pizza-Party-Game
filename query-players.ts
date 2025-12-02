/**
 * Query script to get all player addresses from old contract
 * Extracts from DailyGameEntered events
 */

import { ethers } from "ethers";

const OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7";
const RPC_URL = "https://mainnet.base.org";

// Event signature for DailyGameEntered(uint256 indexed gameId, address indexed player, bool isFirst, uint256 amount)
const DAILY_GAME_ENTERED_TOPIC = ethers.id("DailyGameEntered(uint256,address,bool,uint256)");

async function getPlayers() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log("📡 Querying DailyGameEntered events from old contract...\n");

  try {
    // Query all DailyGameEntered events
    const logs = await provider.getLogs({
      address: OLD_CONTRACT_ADDRESS,
      topics: [DAILY_GAME_ENTERED_TOPIC],
      fromBlock: 0,
      toBlock: "latest",
    });

    console.log(`Found ${logs.length} DailyGameEntered events\n`);

    // Extract unique player addresses from topic[2] (indexed player parameter)
    const playerSet = new Set<string>();
    logs.forEach((log) => {
      if (log.topics[2]) {
        const playerAddress = ethers.getAddress("0x" + log.topics[2].slice(26));
        playerSet.add(playerAddress);
      }
    });

    const players = Array.from(playerSet);
    console.log(`Found ${players.length} unique players\n`);
    console.log("Player addresses:");
    players.forEach((p) => console.log(`  ${p}`));

    // Output as array for copy-pasting into migration script
    console.log("\n📋 Copy this array into migrate-stats.ts (playerAddresses):\n");
    console.log("const playerAddresses = [");
    players.forEach((p) => console.log(`  "${p}",`));
    console.log("];");
  } catch (error) {
    console.error("❌ Error querying events:", error);
  }
}

getPlayers();
