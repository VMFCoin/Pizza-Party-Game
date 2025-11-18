#!/bin/bash

# Verify using flattened contract (fixes import issues)

set -e

if [ -z "$1" ]; then
    echo "Usage: ./verify_flattened.sh <BASESCAN_API_KEY>"
    exit 1
fi

BASESCAN_API_KEY="$1"
CONTRACT_ADDRESS="0x6C29EA432121d86cE859a4B2A38A64A28ad813a3"
VMF_TOKEN="0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776"
TREASURY_WALLET="0x4479b00012D35894278C754385f5640A7AD5A27E"

echo "🔍 Verifying PizzaParty contract (flattened) on BaseScan..."
echo "Contract: $CONTRACT_ADDRESS"
echo ""

cd foundry

# Flatten the contract
echo "📦 Flattening contract..."
forge flatten src/PizzaParty.sol -o /tmp/PizzaParty_flattened.sol

# Encode constructor arguments
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address)" "$VMF_TOKEN" "$TREASURY_WALLET")

echo "Constructor args: $CONSTRUCTOR_ARGS"
echo ""

# Use forge verify-contract with flattened source
# Note: We'll need to use the web interface or a different method for flattened contracts
echo "⚠️  For flattened contracts, manual verification is recommended."
echo ""
echo "Manual verification steps:"
echo "1. Go to: https://basescan.org/address/$CONTRACT_ADDRESS#code"
echo "2. Click 'Verify and Publish'"
echo "3. Select 'Solidity (Single file)'"
echo "4. Compiler: 0.8.20"
echo "5. License: MIT"
echo "6. Optimization: Yes (200 runs)"
echo "7. Via IR: Yes"
echo "8. Constructor args: $CONSTRUCTOR_ARGS"
echo "9. Paste flattened contract from: /tmp/PizzaParty_flattened.sol"
echo ""
echo "Or use the API with the flattened source..."

