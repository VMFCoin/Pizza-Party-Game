# Quick Deployment Guide

## Setup (One-time)

1. **Create/Update `.env` file** in project root:
   ```bash
   PRIVATE_KEY=0x...your_private_key_here
   TREASURY_WALLET=0x...treasury_wallet_address
   BASE_RPC_URL=https://mainnet.base.org
   BASESCAN_API_KEY=...your_basescan_api_key
   ```

2. **Get BaseScan API Key**:
   - Visit https://basescan.org/apis
   - Sign up/login and get your API key

## Deploy

### Option 1: Use the deployment script (Recommended)
```bash
./deploy.sh
```

### Option 2: Manual deployment
```bash
cd foundry
forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

## What You Need

- **PRIVATE_KEY**: Deployer wallet private key (must have ETH on Base for gas)
- **TREASURY_WALLET**: Address that will fund weekly jackpots
- **BASE_RPC_URL**: Base mainnet RPC (can use public: https://mainnet.base.org)
- **BASESCAN_API_KEY**: For automatic contract verification

## After Deployment

1. ✅ Contract will be automatically verified on BaseScan
2. ⚠️ **IMPORTANT**: Treasury must approve contract:
   ```solidity
   // Call on VMF token contract
   approve(pizzaPartyAddress, type(uint256).max)
   ```
3. ⚠️ Fund treasury wallet with VMF tokens for weekly jackpots

## Contract Addresses

- **VMF Token**: `0xa3e82aDf6bD3207a1D2470ed7Ad742596Ee81776` (already on Base)
- **PizzaParty**: Will be shown after deployment

