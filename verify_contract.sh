#!/bin/bash

# Verify PizzaParty contract on BaseScan

set -e

CONTRACT_ADDRESS="0xaF196185715B85445aB2bd83a81fDe0aE7dF05fb"
VMF_TOKEN="0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776"
TREASURY_WALLET="0x4479b00012D35894278C754385f5640A7AD5A27E"

if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

source .env
BASESCAN_API_KEY=$(echo -n "$BASESCAN_API_KEY" | tr -d '\r\n' | xargs)

if [ -z "$BASESCAN_API_KEY" ]; then
    echo "❌ Error: BASESCAN_API_KEY not set in .env file!"
    echo ""
    echo "To verify:"
    echo "1. Get API key from https://basescan.org/apis"
    echo "2. Add to .env: BASESCAN_API_KEY=your_key"
    echo "3. Run this script again"
    exit 1
fi

echo "🔍 Verifying PizzaParty contract on BaseScan..."
echo "Contract: $CONTRACT_ADDRESS"
echo ""

cd foundry

# Encode constructor arguments
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address)" "$VMF_TOKEN" "$TREASURY_WALLET")

echo "Constructor args: $CONSTRUCTOR_ARGS"
echo ""

forge verify-contract \
    "$CONTRACT_ADDRESS" \
    src/PizzaParty.sol:PizzaParty \
    --chain-id 8453 \
    --etherscan-api-key "$BASESCAN_API_KEY" \
    --constructor-args "$CONSTRUCTOR_ARGS" \
    --compiler-version "0.8.20" \
    --num-of-optimizations 200 \
    --via-ir

echo ""
echo "✅ Verification submitted!"
echo "Check status at: https://basescan.org/address/$CONTRACT_ADDRESS#code"

