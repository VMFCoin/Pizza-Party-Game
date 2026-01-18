# $PIZZA Token Migration - Ready to Execute

## Overview
Everything is prepared for the token migration. When you have the new token address, follow the steps below.

**No existing code has been modified. All preparation is in this `/migration` folder.**

---

## Two Migration Scripts

| Script | Purpose |
|--------|---------|
| `token-migration.sh` | Swaps token address (0x...) everywhere |
| `supply-migration.sh` | Updates staking tiers/limits for 100B supply |

**Run BOTH when migrating!**

---

## Quick Start (When You Have the New Address)

### Step 1: Update Smart Contracts (On-Chain)
```bash
# Using cast (from foundry)
export NEW_TOKEN=0xYOUR_NEW_TOKEN_ADDRESS
export PK=your_private_key

# Update PizzaPartyV2
cast send 0xA1C31c3eF1448351da0b1D430148660982B6f3dD \
  "adminSetPizzaToken(address)" $NEW_TOKEN \
  --private-key $PK --rpc-url https://mainnet.base.org

# Update PizzaStaking
cast send 0xCbAf5bACe5419710C3852653d3DdEB831d7415be \
  "adminSetPizzaToken(address)" $NEW_TOKEN \
  --private-key $PK --rpc-url https://mainnet.base.org

# PizzaParlorManager - NEEDS UPGRADE (see SMART_CONTRACT_MIGRATION.md)
```

### Step 2: Update Code (Run Migration Script)
```bash
cd /Users/michaelgray/Downloads/pizzaApp
./migration/token-migration.sh --execute 0xYOUR_NEW_TOKEN_ADDRESS
```

### Step 3: Deploy Updated Frontend
```bash
# Deploy your Next.js app as usual
```

---

## What the Migration Script Updates

| Category | Files | Count |
|----------|-------|-------|
| **Frontend/Backend** | constants, cron jobs, price API | 4 files |
| **Deployment Scripts** | Foundry deploy/upgrade scripts | 6 files |
| **Test Files** | Foundry test files | 3 files |

**Total: 13 files** - all automatically updated with backups created.

---

## Files in This Folder

| File | Purpose |
|------|---------|
| `README.md` | This file - quick start guide |
| `TOKEN_MIGRATION_CHECKLIST.md` | Detailed checklist of all tasks |
| `SMART_CONTRACT_MIGRATION.md` | Smart contract update guide |
| `ADDITIONAL_CONSIDERATIONS.md` | Price feeds, staking, supply changes |
| `token-migration.sh` | Script to update all code files |
| `migration-scan.ts` | TypeScript scanner for token references |

---

## Pre-Migration Checklist

Before running migration:
- [ ] Have new token contract address
- [ ] Verify new token has `burn(uint256)` function
- [ ] Verify new token has 18 decimals
- [ ] Verify new token has liquidity on DEX (for price feeds)
- [ ] Fund treasury wallet with new tokens
- [ ] Fund staking rewards wallet with new tokens

---

## Important Notes

1. **PizzaParlorManager** needs a contract upgrade to add `adminSetPizzaToken()` - see [SMART_CONTRACT_MIGRATION.md](./SMART_CONTRACT_MIGRATION.md)

2. **Wallets stay the same** - owner, treasury, staking rewards wallets don't change

3. **Backups are automatic** - running the migration script creates timestamped backups in `migration/backups/`

4. **Rollback is easy** - just restore from backups or run script with old address

---

## Verification After Migration

```bash
# Check smart contracts point to new token
cast call 0xA1C31c3eF1448351da0b1D430148660982B6f3dD "pizzaToken()(address)"
cast call 0xCbAf5bACe5419710C3852653d3DdEB831d7415be "pizzaToken()(address)"
cast call 0x7acfaa1dadd836404a8d90b49581758c4fdc889b "pizzaToken()(address)"

# Check price feed works
curl "https://api.dexscreener.com/latest/dex/tokens/NEW_TOKEN_ADDRESS"
```

---

## Need Help?

See the detailed documentation:
- [TOKEN_MIGRATION_CHECKLIST.md](./TOKEN_MIGRATION_CHECKLIST.md) - Full task list
- [SMART_CONTRACT_MIGRATION.md](./SMART_CONTRACT_MIGRATION.md) - Contract updates
- [ADDITIONAL_CONSIDERATIONS.md](./ADDITIONAL_CONSIDERATIONS.md) - Edge cases
