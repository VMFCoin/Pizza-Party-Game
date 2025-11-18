# Contract Verification Instructions

## Quick Method (Recommended)

### Step 1: Get BaseScan API Key (Free)
1. Visit: https://basescan.org/apis
2. Sign up or log in (it's free)
3. Create an API key
4. Copy the API key

### Step 2: Verify Using Script
```bash
./verify_with_api_key.sh YOUR_API_KEY_HERE
```

### Step 3: Or Add to .env and Verify
```bash
# Add to .env file:
BASESCAN_API_KEY=your_api_key_here

# Then run:
./verify_contract.sh
```

---

## Manual Verification (Alternative)

If you prefer to verify manually through the web interface:

1. **Go to your contract**: https://basescan.org/address/0x6C29EA432121d86cE859a4B2A38A64A28ad813a3#code

2. **Click "Verify and Publish"**

3. **Fill in the form**:
   - **Compiler Type**: `Solidity (Standard JSON Input)` or `Solidity (Single file)`
   - **Compiler Version**: `0.8.20`
   - **License**: `MIT`
   - **Optimization**: `Yes` (200 runs)
   - **Via IR**: `Yes`
   - **Constructor Arguments**: 
     ```
     000000000000000000000000a3e82adf6bd3207a1d2470ed7ad742596ee817760000000000000000000000004479b00012d35894278c754385f5640a7ad5a27e
     ```

4. **For Single File Method**:
   - Copy the entire contract from `foundry/src/PizzaParty.sol`
   - Paste into the source code field
   - Note: You'll need to flatten imports or use Standard JSON Input

5. **For Standard JSON Input** (Recommended):
   - Use Foundry's build output
   - The JSON is in: `foundry/out/PizzaParty.sol/PizzaParty.json`

---

## Verification Details

- **Contract Address**: `0x6C29EA432121d86cE859a4B2A38A64A28ad813a3`
- **Network**: Base Mainnet (Chain ID: 8453)
- **Compiler**: Solidity 0.8.20
- **Optimization**: Enabled (200 runs)
- **Via IR**: Yes
- **License**: MIT

## Constructor Arguments (ABI-encoded)
```
0x000000000000000000000000a3e82adf6bd3207a1d2470ed7ad742596ee817760000000000000000000000004479b00012d35894278c754385f5640a7ad5a27e
```

This encodes:
- VMF Token: `0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776`
- Treasury: `0x4479b00012D35894278C754385f5640A7AD5A27E`

