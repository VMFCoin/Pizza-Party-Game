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

async function checkOldContract() {
  try {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const contract = new ethers.Contract(OLD_CONTRACT_ADDRESS, PIZZA_PARTY_ABI, provider);

    console.log("Checking players in OLD contract...\n");

    let playersWithStats = 0;
    const addressesWithStats = [];

    for (let i = 0; i < playerAddresses.length; i++) {
      const player = playerAddresses[i];
      try {
        const stats = await contract.getPlayerLifetimeStats(player);
        const hasStats = stats.totalDailyWins > 0n || stats.totalWeeklyWins > 0n;

        if (hasStats) {
          playersWithStats++;
          const vmfAmount = ethers.formatEther(stats.totalVmfWon);
          console.log(`${i + 1}. ${player}`);
          console.log(`   ✓ Daily: ${stats.totalDailyWins}, Weekly: ${stats.totalWeeklyWins}, VMF: ${vmfAmount}`);
          addressesWithStats.push(player);
        } else {
          console.log(`${i + 1}. ${player} - ✗ No stats`);
        }
      } catch (error) {
        console.log(`${i + 1}. ${player} - ✗ Error: ${error.message.substring(0, 80)}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n📊 Summary:`);
    console.log(`  • Total addresses checked: ${playerAddresses.length}`);
    console.log(`  • Players with stats: ${playersWithStats}`);

    if (playersWithStats < 22) {
      console.log(`\n⚠️  Only ${playersWithStats} of 22 expected players found in OLD contract.`);
      console.log(`   Missing: ${22 - playersWithStats} players`);
    }

    console.log(`\n📝 Addresses with stats in OLD contract:`);
    console.log("const playerAddresses = [");
    addressesWithStats.forEach((addr, idx) => {
      const comma = idx < addressesWithStats.length - 1 ? "," : "";
      console.log(`  "${addr}"${comma}`);
    });
    console.log("];");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkOldContract();
