# Verification Using Standard JSON Input (Supports Via IR)

Since BaseScan's "Single file" method doesn't have a "Via IR" option, but your contract was compiled with `via_ir = true`, you need to use the **Standard JSON Input** method instead.

## Steps:

1. **Go to BaseScan**: https://basescan.org/address/0x6C29EA432121d86cE859a4B2A38A64A28ad813a3#code

2. **Click "Verify and Publish"**

3. **Select**: `Solidity (Standard JSON Input)` ⚠️ **NOT "Single file"**

4. **Fill in**:
   - **Compiler Version**: `v0.8.20+commit.a1b79de6`
   - **License**: `MIT (3)`
   - **Constructor Arguments**:
     ```
     000000000000000000000000a3e82adf6bd3207a1d2470ed7ad742596ee817760000000000000000000000004479b00012d35894278c754385f5640a7ad5a27e
     ```

5. **Standard JSON Input**: 
   - I'll generate this file for you - it contains all the compiler settings including Via IR

6. **Submit**

## Why Standard JSON Input?

- ✅ Supports Via IR (your contract requires this)
- ✅ Includes all compiler settings exactly as deployed
- ✅ More reliable for complex contracts with dependencies

Let me generate the Standard JSON Input file for you now...

