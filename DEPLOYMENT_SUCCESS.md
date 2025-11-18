# ✅ PizzaParty Deployment Successful!

## Contract Details

- **Contract Address**: `0x6C29EA432121d86cE859a4B2A38A64A28ad813a3`
- **Network**: Base Mainnet (Chain ID: 8453)
- **Deployer**: `0x7b7fF9948c994d3748b0803C36Efb67047Fd4Cf4`
- **Owner**: `0x7b7fF9948c994d3748b0803C36Efb67047Fd4Cf4`
- **VMF Token**: `0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776`
- **Treasury Wallet**: `0x4479b00012D35894278C754385f5640A7AD5A27E`

## View on BaseScan

🔗 **Contract**: https://basescan.org/address/0x6C29EA432121d86cE859a4B2A38A64A28ad813a3

## Next Steps

### 1. Verify Contract on BaseScan

**Option A: Automatic (if you have API key)**
```bash
# Add BASESCAN_API_KEY to .env file, then:
./verify_contract.sh
```

**Option B: Manual Verification**
1. Visit https://basescan.org/address/0x6C29EA432121d86cE859a4B2A38A64A28ad813a3#code
2. Click "Verify and Publish"
3. Fill in:
   - Compiler: `0.8.20`
   - License: `MIT`
   - Optimization: `Yes` (200 runs)
   - Via IR: `Yes`
   - Constructor args: `000000000000000000000000a3e82adf6bd3207a1d2470ed7ad742596ee817760000000000000000000000004479b00012d35894278c754385f5640a7ad5a27e`

### 2. Treasury Setup (CRITICAL)

The treasury wallet must approve the contract to spend VMF tokens:

```solidity
// Call on VMF token contract (0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776)
approve(0x6C29EA432121d86cE859a4B2A38A64A28ad813a3, type(uint256).max)
```

**Using cast:**
```bash
cast send 0xA3E82adF6bd3207a1d2470ED7Ad742596Ee81776 \
  "approve(address,uint256)" \
  0x6C29EA432121d86cE859a4B2A38A64A28ad813a3 \
  $(cast --to-uint256 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff) \
  --rpc-url https://mainnet.base.org \
  --private-key $TREASURY_PRIVATE_KEY
```

### 3. Fund Treasury

Ensure the treasury wallet has sufficient VMF tokens to fund weekly jackpots.

### 4. Update Frontend

Update your frontend configuration with the new contract address:
```typescript
export const PIZZA_PARTY_ADDRESS = "0x6C29EA432121d86cE859a4B2A38A64A28ad813a3"
```

## Contract Status

✅ Deployed  
⏳ Verification (pending - add BASESCAN_API_KEY to verify)  
⏳ Treasury Approval (pending)  
⏳ Treasury Funding (pending)

## Gas Costs

- **Deployment**: ~3,447,012 gas (~0.0000136 ETH at 0.0039 gwei)

## Contract Functions

The contract is now live and ready to use! Key functions:
- `enterDailyGame()` / `enterDailyGameNoRef()` - Enter daily lottery
- `claimToppings()` - Claim weekly toppings (during claim window)
- `settleDailyGame()` - Settle daily game (anyone can call)
- `settleWeeklyGame()` - Settle weekly game (after claim window)

See `PizzaParty_Documentation.md` for full documentation.

