# $PIZZA Token Migration Checklist

## Overview
This document outlines all steps required to migrate Pizza Party from the current $PIZZA token to the new $PIZZA token (100 billion total supply).

**CRITICAL: Do NOT execute any changes until you have the new token contract address!**

---

## Pre-Migration Requirements

### 1. New Token Information Needed
- [ ] New $PIZZA token contract address (Base mainnet)
- [ ] Verify token decimals (expected: 18)
- [ ] Verify total supply: 100,000,000,000 (100 billion)
- [ ] Verify `burn()` function exists on new Clanker contract
- [ ] Get new token's EIP-712 domain info for permit signatures

### 2. Current Token Addresses (DO NOT USE - Reference Only)
```
Current PIZZA Token: 0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69
```

---

## Files Requiring Token Address Update

### Smart Contracts (Require Redeployment or Admin Functions)
| File | Line | Current Usage |
|------|------|---------------|
| `foundry/src/PizzaPartyV2Upgradeable.sol` | Storage | `pizzaToken` state variable |
| `foundry/src/PizzaStakingV1Upgradeable.sol` | Storage | `pizzaToken` state variable |
| `foundry/src/PizzaParlorManagerUpgradeable.sol` | Storage | `token` state variable |
| `foundry/script/DeployPizzaStaking.s.sol` | Line 25 | Hardcoded constant |

### Frontend/Backend (Code Changes)
| File | Line | Current Usage |
|------|------|---------------|
| `app/lib/constants/index.tsx` | Line 11 | `PIZZA_TOKEN_ADDRESS` export |
| `app/api/cron/settle-game/route.ts` | Line 61 | `PIZZA_TOKEN_ADDRESS` constant |
| `app/api/cron/settle-weekly/route.ts` | Line 86 | `PIZZA_TOKEN_ADDRESS` constant |

---

## Smart Contract Migration Options

### Option A: Use Admin Functions (Preferred if available)
The upgradeable contracts may have admin functions to update the token address:

1. **PizzaStakingV1Upgradeable** - Has `adminSetPizzaToken(address)` function
2. **PizzaPartyV2** - Check for similar admin function
3. **PizzaParlorManager** - Check for similar admin function

### Option B: Deploy New Contracts
If admin functions don't exist, new contract deployments required:
1. Deploy new PizzaPartyV2 implementation
2. Deploy new PizzaStaking implementation
3. Deploy new PizzaParlorManager implementation
4. Upgrade proxies to new implementations

---

## Token Economics Changes (100B Supply)

### Current Limits to Review
| Parameter | Current Value | Notes |
|-----------|---------------|-------|
| Max stake per user | 1,000,000 PIZZA | May need adjustment for 100B supply |
| Min entry fee | 0.01 PIZZA | Review based on new price |
| Max entry fee | 1,000 PIZZA | Review based on new price |
| Min parlor price | 500 PIZZA | Review based on new price |
| Max parlor price | 500,000 PIZZA | Review based on new price |

### Price Impact Considerations
With 100B supply (vs current supply), token price will be significantly lower.
Dynamic pricing should handle this, but verify safety bounds are appropriate.

---

## Burn Function Integration

### Current Burn Implementation
Location: `foundry/src/PizzaParlorManagerUpgradeable.sol`
```solidity
interface IBurnable {
    function burn(uint256 amount) external;
}

// In purchaseParlor():
IBurnable(address(token)).burn(burnAmount);
```

### New Token Burn Verification
- [ ] Confirm new Clanker token has `burn(uint256)` function
- [ ] Verify burn function signature matches: `function burn(uint256 amount) external`
- [ ] Test burn function on testnet if available
- [ ] Verify contract has approval to call burn (or if it burns from own balance)

---

## Migration Steps (Execute in Order)

### Phase 1: Preparation (Before Migration)
- [ ] Run `migration-scan.ts` script to verify all locations
- [ ] Backup current contract states
- [ ] Document current staking positions
- [ ] Document current parlor ownerships
- [ ] Announce migration timeline to users

### Phase 2: Smart Contract Updates
- [ ] Update PizzaStaking token address via `adminSetPizzaToken()`
- [ ] Update PizzaPartyV2 token address (method TBD)
- [ ] Update PizzaParlorManager token address (method TBD)
- [ ] Verify all contracts point to new token

### Phase 3: Frontend/Backend Updates
- [ ] Run `token-migration.sh` script with new address
- [ ] Verify `app/lib/constants/index.tsx` updated
- [ ] Verify `app/api/cron/settle-game/route.ts` updated
- [ ] Verify `app/api/cron/settle-weekly/route.ts` updated
- [ ] Update EIP-712 permit domain if needed

### Phase 4: Testing
- [ ] Test game entry with new token
- [ ] Test staking with new token
- [ ] Test parlor purchase (verify burn works)
- [ ] Test price feeds return data for new token
- [ ] Verify wallet displays correct balances

### Phase 5: Deployment
- [ ] Deploy updated frontend
- [ ] Monitor first transactions
- [ ] Verify burns are occurring correctly

---

## Rollback Plan
If issues occur:
1. Revert code changes using git
2. Contact smart contract admin to revert token addresses
3. Communicate with users about delay

---

## Additional Considerations

### 1. Liquidity Pool
- [ ] Ensure new token has DEX liquidity on Base
- [ ] Verify DexScreener/GeckoTerminal can fetch price
- [ ] Update price feed URLs if token pair address differs

### 2. User Communication
- [ ] Announce token migration date
- [ ] Provide swap instructions (old -> new token)
- [ ] Update any documentation referencing old token

### 3. Staking Migration
- [ ] Decide: Do stakers need to unstake old token and restake new?
- [ ] Or: Will rewards be distributed in new token automatically?
- [ ] Clear communication needed for stakers

### 4. Treasury/Rewards Wallets
- [ ] Ensure treasury wallet has new tokens for free slices
- [ ] Ensure staking rewards wallet has new tokens for rewards
- [ ] Update any multisig configurations if needed

---

## Scripts Available
- `migration/migration-scan.ts` - Scans codebase for all token references
- `migration/token-migration.sh` - Updates all hardcoded addresses (dry-run by default)

---

## Contact/Support
Document any issues encountered during migration here for future reference.
