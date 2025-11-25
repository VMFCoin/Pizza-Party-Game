#!/bin/bash

# Script to set treasury wallet on PizzaParty contract
# Make sure your .env file has: PRIVATE_KEY, BASE_RPC_URL

set -e

echo "🍕 Setting Treasury Wallet on PizzaParty Contract"
echo "================================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
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
if [ -z "$PRIVATE_KEY" ] || [ -z "$BASE_RPC_URL" ]; then
    echo "❌ Error: Missing required environment variables!"
    echo "Please set: PRIVATE_KEY, BASE_RPC_URL"
    exit 1
fi

CONTRACT_ADDRESS="0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7"
NEW_TREASURY="0x4479b00012D35894278C754385f5640A7AD5A27E"

echo "Contract Address: $CONTRACT_ADDRESS"
echo "New Treasury: $NEW_TREASURY"
echo "RPC URL: $BASE_RPC_URL"
echo ""

echo "📝 Setting treasury wallet using cast..."

# First, check current treasury
echo ""
echo "Current treasury:"
cast call "$CONTRACT_ADDRESS" "treasuryWallet()(address)" --rpc-url "$BASE_RPC_URL"

echo ""
echo "Setting new treasury..."
cast send "$CONTRACT_ADDRESS" \
    "setTreasuryWallet(address)" \
    "$NEW_TREASURY" \
    --rpc-url "$BASE_RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --gas-limit 100000

echo ""
echo "✅ Treasury wallet update complete!"
echo ""
echo "New treasury:"
cast call "$CONTRACT_ADDRESS" "treasuryWallet()(address)" --rpc-url "$BASE_RPC_URL"
echo ""
echo "Verify on BaseScan:"
echo "https://basescan.org/address/$CONTRACT_ADDRESS#readContract"
echo "Check 'treasuryWallet' function"

