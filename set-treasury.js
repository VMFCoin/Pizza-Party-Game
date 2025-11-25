const { ethers } = require('ethers');
require('dotenv').config();

async function setTreasury() {
  // Connect to Base mainnet
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
  
  // Get private key from .env
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not found in .env file');
  }
  
  // Check if it's a placeholder
  if (privateKey.includes('...') || privateKey.length < 20) {
    throw new Error('PRIVATE_KEY appears to be a placeholder. Please set your actual private key in .env file');
  }
  
  // Ensure private key has 0x prefix
  const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  
  // Validate private key format
  if (formattedPrivateKey.length !== 66) {
    throw new Error(`Invalid private key length: ${formattedPrivateKey.length}. Expected 66 characters (0x + 64 hex chars)`);
  }
  
  const wallet = new ethers.Wallet(formattedPrivateKey, provider);
  
  const contractAddress = '0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7';
  const newTreasuryAddress = '0x4479b00012D35894278C754385f5640A7AD5A27E';
  
  // ABI for treasury functions
  const abi = [
    'function treasuryWallet() external view returns (address)',
    'function owner() external view returns (address)',
    'function setTreasuryWallet(address _treasury) external'
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, wallet);
  
  console.log('🍕 Setting Treasury Wallet');
  console.log('==========================');
  console.log('Contract:', contractAddress);
  console.log('Deployer:', wallet.address);
  console.log('');
  
  // Check current treasury
  try {
    const currentTreasury = await contract.treasuryWallet();
    console.log('Current Treasury:', currentTreasury);
    
    if (currentTreasury.toLowerCase() === newTreasuryAddress.toLowerCase()) {
      console.log('✅ Treasury is already set correctly!');
      return;
    }
    
    console.log('New Treasury:', newTreasuryAddress);
    console.log('');
    
    // Check if deployer is owner
    const owner = await contract.owner();
    console.log('Contract Owner:', owner);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error(`❌ Deployer (${wallet.address}) is not the contract owner (${owner})`);
    }
    
    console.log('✅ Deployer is the owner');
    console.log('');
    
    // Set new treasury
    console.log('📝 Setting new treasury wallet...');
    const tx = await contract.setTreasuryWallet(newTreasuryAddress);
    console.log('Transaction hash:', tx.hash);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed!');
    console.log('Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    
    // Verify the change
    const updatedTreasury = await contract.treasuryWallet();
    console.log('');
    console.log('✅ Treasury updated successfully!');
    console.log('New Treasury:', updatedTreasury);
    
    if (updatedTreasury.toLowerCase() === newTreasuryAddress.toLowerCase()) {
      console.log('✅ Verification: Treasury matches expected address');
    } else {
      console.log('❌ Verification failed: Treasury does not match');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.reason) {
      console.error('Reason:', error.reason);
    }
    throw error;
  }
}

setTreasury().catch(console.error);

