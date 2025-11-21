const { ethers } = require('ethers');

async function testDeployedContract() {
  // Connect to Base mainnet
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  
  const contractAddress = '0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7';
  
  // Minimal ABI to test the key functions
  const abi = [
    'function getReferralCode(address player) external view returns (string memory)',
    'function getPlayerLifetimeStats(address player) external view returns (uint256 totalDailyWins, uint256 totalWeeklyWins, uint256 totalVmfWon, uint256 lifetimeToppings, uint256 lifetimeReferrals)',
    'function hasUsedReferral(address player) external view returns (bool)',
    'function getPlayerFromCode(string memory code) external view returns (address)'
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);
  
  console.log('Testing deployed contract at:', contractAddress);
  console.log('---');
  
  // Test 1: Check if getReferralCode exists (new function)
  try {
    const testAddr = '0x7b7fF9948c994d3748b0803C36Efb67047Fd4Cf4'; // Your deployer address
    const code = await contract.getReferralCode(testAddr);
    console.log('✅ getReferralCode() exists');
    console.log('   Generated code for deployer:', code);
    
    // Test 2: Check if it's a valid code format (PZ + 8 chars)
    if (code.startsWith('PZ') && code.length === 10) {
      console.log('✅ Code format is correct (PZ + 8 chars)');
    } else {
      console.log('❌ Code format is wrong:', code);
    }
  } catch (err) {
    console.log('❌ getReferralCode() does NOT exist');
    console.log('   This means OLD contract without fixes');
    return;
  }
  
  // Test 3: Check if hasUsedReferral exists
  try {
    const testAddr = '0x0000000000000000000000000000000000000001';
    const hasUsed = await contract.hasUsedReferral(testAddr);
    console.log('✅ hasUsedReferral() exists');
  } catch (err) {
    console.log('❌ hasUsedReferral() does NOT exist');
  }
  
  // Test 4: Check getPlayerLifetimeStats
  try {
    const testAddr = '0x0000000000000000000000000000000000000001';
    const stats = await contract.getPlayerLifetimeStats(testAddr);
    console.log('✅ getPlayerLifetimeStats() exists');
    console.log('   Structure:', {
      totalDailyWins: stats[0].toString(),
      totalWeeklyWins: stats[1].toString(),
      totalVmfWon: stats[2].toString(),
      lifetimeToppings: stats[3].toString(),
      lifetimeReferrals: stats[4].toString()
    });
  } catch (err) {
    console.log('❌ getPlayerLifetimeStats() does NOT exist');
  }
  
  console.log('---');
  console.log('CONCLUSION:');
  console.log('If all tests passed (✅), your contract HAS the new referral fixes');
  console.log('If any failed (❌), you need to redeploy the updated contract');
}

testDeployedContract().catch(console.error);
