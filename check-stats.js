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

const testPlayers = [
  "0x9157Feb12812b253e84447C6B52C38651fd67FcA",
  "0xdf13d712d58EF7F7Abd4D29B398d503262ba4AC0",
  "0xffde42d40175b3b9349Dfb384439dCB811691E09",
];

async function checkStats() {
  try {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const contract = new ethers.Contract(NEW_CONTRACT_ADDRESS, PIZZA_PARTY_ABI, provider);

    console.log("Checking if stats were migrated...\n");

    for (const player of testPlayers) {
      const stats = await contract.getPlayerLifetimeStats(player);
      const hasStats = stats.totalDailyWins > 0n || stats.totalWeeklyWins > 0n;
      console.log(`${player}: ${hasStats ? 'Has stats' : 'No stats'}`);
      if (hasStats) {
        console.log(`  Daily wins: ${stats.totalDailyWins}, Weekly wins: ${stats.totalWeeklyWins}`);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkStats();
