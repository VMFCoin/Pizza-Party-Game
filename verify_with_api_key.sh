#!/bin/bash

# Quick verification script - just provide API key as argument

set -e

if [ -z "$1" ]; then
    echo "Usage: ./verify_with_api_key.sh <BASESCAN_API_KEY>"
    echo ""
    echo "Get your API key from: https://basescan.org/apis"
    exit 1
fi

BASESCAN_API_KEY="$1"
CONTRACT_ADDRESS="0x6C29EA432121d86cE859a4B2A38A64A28ad813a3"
VMF_TOKEN="0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776"
TREASURY_WALLET="0x4479b00012D35894278C754385f5640A7AD5A27E"

echo "🔍 Verifying PizzaParty contract on BaseScan..."
echo "Contract: $CONTRACT_ADDRESS"
echo ""

# Encode constructor arguments
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address)" "$VMF_TOKEN" "$TREASURY_WALLET")

echo "Constructor args: $CONSTRUCTOR_ARGS"
echo ""

# Run from foundry directory
cd foundry

forge verify-contract \
    "$CONTRACT_ADDRESS" \
    src/PizzaParty.sol:PizzaParty \
    --chain-id 8453 \
    --etherscan-api-key "$BASESCAN_API_KEY" \
    --constructor-args "$CONSTRUCTOR_ARGS" \
    --compiler-version "0.8.20" \
    --num-of-optimizations 200 \
    --via-ir \
    --root .

echo ""
echo "✅ Verification submitted!"
echo "Check status at: https://basescan.org/address/$CONTRACT_ADDRESS#code"

