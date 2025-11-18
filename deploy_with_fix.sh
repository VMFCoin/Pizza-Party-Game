#!/bin/bash

# PizzaParty Deployment Script - Auto-fixes PRIVATE_KEY format

set -e

echo "🍕 PizzaParty Deployment to Base Mainnet"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Create temporary .env with fixed PRIVATE_KEY
TEMP_ENV=$(mktemp)
while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line == PRIVATE_KEY=* ]]; then
        # Remove PRIVATE_KEY= prefix and strip whitespace/carriage returns
        key_value="${line#PRIVATE_KEY=}"
        key_value=$(echo -n "$key_value" | tr -d '\r\n' | xargs)
        # Add 0x prefix if missing
        if [[ ! $key_value == 0x* ]]; then
            echo "PRIVATE_KEY=0x$key_value" >> "$TEMP_ENV"
            echo "✓ Fixed PRIVATE_KEY format (added 0x prefix)"
        else
            echo "PRIVATE_KEY=$key_value" >> "$TEMP_ENV"
        fi
    else
        echo "$line" >> "$TEMP_ENV"
    fi
done < .env

# Source the fixed env file and clean variables
source "$TEMP_ENV"

# Strip whitespace and carriage returns from all variables
PRIVATE_KEY=$(echo -n "$PRIVATE_KEY" | tr -d '\r\n' | xargs)
TREASURY_WALLET=$(echo -n "$TREASURY_WALLET" | tr -d '\r\n' | xargs)
BASE_RPC_URL=$(echo -n "$BASE_RPC_URL" | tr -d '\r\n' | xargs)
BASESCAN_API_KEY=$(echo -n "$BASESCAN_API_KEY" | tr -d '\r\n' | xargs)

# Check required variables
if [ -z "$PRIVATE_KEY" ] || [ -z "$TREASURY_WALLET" ] || [ -z "$BASE_RPC_URL" ]; then
    echo "❌ Error: Missing required environment variables!"
    exit 1
fi

echo "✓ Environment variables loaded"
echo "  Treasury Wallet: $TREASURY_WALLET"
echo "  RPC URL: $BASE_RPC_URL"
echo ""

# Export variables for forge (clean versions)
export PRIVATE_KEY
export TREASURY_WALLET
export BASE_RPC_URL
export BASESCAN_API_KEY

# Build contract
echo "📦 Building contract..."
cd foundry
forge build

# Deploy
echo ""
echo "🚀 Deploying to Base mainnet..."
echo ""

if [ -n "$BASESCAN_API_KEY" ]; then
    echo "✓ Will verify contract on BaseScan"
    forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
        --rpc-url "$BASE_RPC_URL" \
        --broadcast \
        --verify \
        --etherscan-api-key "$BASESCAN_API_KEY" \
        -vvvv
else
    echo "⚠️  BASESCAN_API_KEY not set - deploying without verification"
    forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
        --rpc-url "$BASE_RPC_URL" \
        --broadcast \
        -vvvv
fi

# Cleanup
rm -f "$TEMP_ENV"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. If not verified, verify manually on BaseScan"
echo "2. Treasury wallet must approve contract to spend VMF"
echo "3. Fund treasury wallet with VMF tokens"

