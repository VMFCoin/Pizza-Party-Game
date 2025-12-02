#!/bin/bash

# PizzaParty Deployment Script for Base Mainnet
# Make sure your .env file has: PRIVATE_KEY, TREASURY_WALLET, BASE_RPC_URL, BASESCAN_API_KEY

set -e

echo "🍕 PizzaParty Deployment to Base Mainnet"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with the following variables:"
    echo "  PRIVATE_KEY=your_private_key"
    echo "  TREASURY_WALLET=0x..."
    echo "  BASE_RPC_URL=https://mainnet.base.org"
    echo "  BASESCAN_API_KEY=your_api_key"
    exit 1
fi

# Load environment variables
source .env

# Strip whitespace and ensure PRIVATE_KEY has 0x prefix
PRIVATE_KEY=$(echo -n "$PRIVATE_KEY" | tr -d '\r\n' | xargs)
if [[ ! "$PRIVATE_KEY" =~ ^0x ]]; then
    PRIVATE_KEY="0x$PRIVATE_KEY"
fi
export PRIVATE_KEY

# Check required variables
if [ -z "$PRIVATE_KEY" ] || [ -z "$TREASURY_WALLET" ] || [ -z "$BASE_RPC_URL" ] || [ -z "$BASESCAN_API_KEY" ]; then
    echo "❌ Error: Missing required environment variables!"
    echo "Please set: PRIVATE_KEY, TREASURY_WALLET, BASE_RPC_URL, BASESCAN_API_KEY"
    exit 1
fi

echo "✓ Environment variables loaded"
echo "  Treasury Wallet: $TREASURY_WALLET"
echo "  RPC URL: $BASE_RPC_URL"
echo ""

# Build contract
echo "📦 Building contract..."
cd foundry
forge build

# Deploy
echo ""
echo "🚀 Deploying to Base mainnet..."
echo ""

forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
    --rpc-url "$BASE_RPC_URL" \
    --broadcast \
    --verify \
    --etherscan-api-key "$BASESCAN_API_KEY" \
    -vvvv

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Verify the contract on BaseScan (should be automatic)"
echo "2. 🚨 MIGRATE PLAYER STATS (optional but recommended):"
echo "   - Copy the new contract address from above"
echo "   - Follow the instructions in MIGRATION_GUIDE.md"
echo "   - This preserves player lifetime stats, wins, and VMF amounts"
echo "3. Treasury wallet must approve contract to spend VMF:"
echo "   vmfToken.approve(pizzaPartyAddress, type(uint256).max)"
echo "4. Fund treasury wallet with VMF tokens"
echo "5. Update frontend with new contract address"

