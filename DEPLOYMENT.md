# PizzaParty Deployment Guide - Base Mainnet

## Prerequisites

1. **Environment Variables**: Create a `.env` file in the project root with:
   ```
   PRIVATE_KEY=your_private_key_here
   TREASURY_WALLET=0x0000000000000000000000000000000000000000
   BASE_RPC_URL=https://mainnet.base.org
   BASESCAN_API_KEY=your_basescan_api_key_here
   ```

2. **Wallet Requirements**:
   - Deployer wallet must have ETH on Base mainnet for gas
   - Treasury wallet should be funded with VMF tokens
   - Treasury wallet must approve the contract to spend VMF

3. **Get BaseScan API Key**:
   - Visit https://basescan.org/apis
   - Create an account and get your API key

## Deployment Steps

### Step 1: Set Environment Variables

Create a `.env` file:
```bash
PRIVATE_KEY=0x...
TREASURY_WALLET=0x...
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=...
```

### Step 2: Build the Contract

```bash
cd foundry
forge build
```

### Step 3: Deploy to Base Mainnet

```bash
forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

Or using the profile:
```bash
forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
  --profile mainnet \
  --broadcast \
  --verify \
  -vvvv
```

### Step 4: Verify Deployment

After deployment, the contract will be automatically verified on BaseScan if the `--verify` flag is used.

You can also manually verify:
```bash
forge verify-contract <CONTRACT_ADDRESS> \
  src/PizzaParty.sol:PizzaParty \
  --chain-id 8453 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address)" $VMF_TOKEN $TREASURY_WALLET)
```

## Post-Deployment Checklist

1. ✅ Verify contract on BaseScan
2. ✅ Treasury wallet approves contract to spend VMF:
   ```solidity
   vmfToken.approve(pizzaPartyAddress, type(uint256).max);
   ```
3. ✅ Fund treasury wallet with sufficient VMF for weekly jackpots
4. ✅ Test contract functions (view functions first)
5. ✅ Update frontend with new contract address

## Contract Addresses

- **VMF Token**: `0xa3e82aDf6bD3207a1D2470ed7Ad742596Ee81776` (Base mainnet)
- **PizzaParty Contract**: Will be displayed after deployment

## Important Notes

- The contract owner is set to the deployer address
- Daily and weekly games are automatically initialized on deployment
- Make sure treasury has approved the contract before first weekly settlement
- Monitor gas costs and treasury balance

