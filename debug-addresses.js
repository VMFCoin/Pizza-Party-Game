const { ethers } = require("ethers");

const OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7";
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

// All 16 addresses
const playerAddresses = [
  "0x9157Feb12812b253e84447C6B52C38651fd67FcA",    // 1 - works
  "0xdf13d712d58EF7F7Abd4D29B398d503262ba4AC0",    // 2 - works
  "0xffde42d40175b3b9349Dfb384439dCB811691E09",    // 3 - works
  "0xD68C5493e41F03faC90776ad0366376E245255E8",    // 4 - works
  "0xC77dA8cB158BA77BaC765625745a766Af3111A69",    // 5 - works
  "0x65e3419E633833Df1D602e7905Cb9C7e541f0849",    // 6 - ERROR
  "0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765",    // 7 - ERROR
  "0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66",    // 8 - ERROR
  "0xBc4340Af8B93b0260ec8052CFA50982dD0865ba7",    // 9 - ERROR
  "0x1B49689db12080f5FcC5DC36f990599739487566",    // 10 - ERROR
  "0x8B06bd80840F0c6Ed78Aa8c3cc1d8eC155118d12",    // 11 - ERROR
  "0xF0F950DfF685f166F2531fbCf97CebEa000ef3B8",    // 12 - ERROR
  "0xd1CB812192C535d2762Bf4AD1f1C1D4deE3e383e",    // 13 - ERROR
  "0x14E8FddFa4a7c709C19a8C7DA5205c3ae366355c",    // 14 - ERROR
  "0xc64c699514E74451a627ccE93D45dc2E8f3a7793",    // 15 - ERROR
  "0xf091E8c19D1F5F3D44D0D3311001Af1437B4F5B8",    // 16 - ERROR (owner)
];

async function debugAddresses() {
  try {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const contract = new ethers.Contract(OLD_CONTRACT_ADDRESS, PIZZA_PARTY_ABI, provider);

    console.log("Debugging address queries...\n");
    console.log("Testing each address one by one with longer delays:\n");

    for (let i = 0; i < playerAddresses.length; i++) {
      const player = playerAddresses[i];
      console.log(`[${i + 1}/${playerAddresses.length}] ${player}`);

      try {
        const stats = await contract.getPlayerLifetimeStats(player);
        console.log(`    ✓ Success - Daily: ${stats.totalDailyWins}, Weekly: ${stats.totalWeeklyWins}`);
      } catch (error) {
        console.log(`    ✗ Error: ${error.code || error.message.substring(0, 100)}`);

        // Try again after a longer delay
        console.log(`    ⏳ Retrying after 2 second delay...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const stats = await contract.getPlayerLifetimeStats(player);
          console.log(`    ✓ Retry Success - Daily: ${stats.totalDailyWins}, Weekly: ${stats.totalWeeklyWins}`);
        } catch (retryError) {
          console.log(`    ✗ Retry failed: ${retryError.code || retryError.message.substring(0, 80)}`);
        }
      }

      // Longer delay between attempts
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

  } catch (error) {
    console.error("Error:", error.message);
  }
}

debugAddresses();
