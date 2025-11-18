# Contract Verification Guide - Fixed

## Issue Fixed
The flattened contract had a malformed pragma statement. It's now fixed in `PizzaParty_flattened.sol`.

## Exact Verification Settings

**Contract Address**: `0x6C29EA432121d86cE859a4B2A38A64A28ad813a3`

### Step-by-Step Instructions

1. **Go to BaseScan**: https://basescan.org/address/0x6C29EA432121d86cE859a4B2A38A64A28ad813a3#code

2. **Click "Verify and Publish"**

3. **Select**: `Solidity (Single file)`

4. **Fill in EXACTLY** (these must match deployment settings):
   - **Compiler Version**: `v0.8.20+commit.a1b79de6`
   - **License**: `MIT (3)`
   - **Optimization**: `Yes` ✅
   - **Runs**: `200`
   - **EVM Version**: `default` or `shanghai`
   - **Via IR**: `Yes` ✅ **CRITICAL - MUST BE CHECKED!**
   - **Constructor Arguments** (ABI-encoded):
     ```
     000000000000000000000000a3e82adf6bd3207a1d2470ed7ad742596ee817760000000000000000000000004479b00012d35894278c754385f5640a7ad5a27e
     ```

5. **Source Code**:
   - Open `PizzaParty_flattened.sol` from your project root
   - Copy **ALL** content (entire file)
   - Paste into the source code field

6. **Click "Verify and Publish"**

## Important Notes

- ✅ **Via IR must be enabled** - This is critical! The contract was compiled with `via_ir = true`
- ✅ **Optimizer must be enabled** with 200 runs
- ✅ **Compiler version must match exactly**: `v0.8.20+commit.a1b79de6`
- ✅ Use the fixed `PizzaParty_flattened.sol` file (pragma has been corrected)

## If Verification Still Fails

If you still get a bytecode mismatch error, try:

1. **Check EVM Version**: Try `shanghai` instead of `default`
2. **Verify constructor args**: Make sure you're using the exact hex string above
3. **Check for extra whitespace**: Make sure the source code doesn't have trailing newlines
4. **Try Standard JSON Input**: Use the Standard JSON Input method instead (more complex but more reliable)

## Alternative: Standard JSON Input Method

If single file doesn't work, we can try the Standard JSON Input method which uses the build artifacts directly. Let me know if you need help with this approach.

