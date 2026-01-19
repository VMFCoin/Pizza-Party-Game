# $PIZZA Token Migration - READY (DO NOT EXECUTE YET)

## Token Addresses

| | Address |
|-|---------|
| **NEW TOKEN** | `0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07` |
| **OLD TOKEN** | `0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69` |
| **OWNER WALLET** | `0x828F516b379A2532bB33a00d34125560BF4c1853` |

---

## Migration Scripts

| Script | Purpose |
|--------|---------|
| `token-migration.sh` | Swaps token address (0x...) in 14 files |
| `supply-migration.sh` | Updates staking tiers/limits for 100B supply |

**Run BOTH when migrating!**

---

## Documentation

| File | Description |
|------|-------------|
| **[COMPLETE_MIGRATION_PLAN.md](./COMPLETE_MIGRATION_PLAN.md)** | Full breakdown of all changes |
| [FULL_MIGRATION_BREAKDOWN.md](./FULL_MIGRATION_BREAKDOWN.md) | Technical details |
| [SMART_CONTRACT_MIGRATION.md](./SMART_CONTRACT_MIGRATION.md) | Contract upgrade guide |
| [TOKEN_MIGRATION_CHECKLIST.md](./TOKEN_MIGRATION_CHECKLIST.md) | Task checklist |

---

## Pre-Migration Checklist

- [ ] **Verify burn() function exists** on new token
- [ ] Verify contract ownership is `0x828F516b379A2532bB33a00d34125560BF4c1853`
- [ ] Fund treasury wallet with new PIZZA
- [ ] Fund staking rewards wallet with new PIZZA
- [ ] Fund jackpot bonus pool (10B PIZZA per jackpot win)
- [ ] Deploy upgraded contract implementations

---

## Execution Commands (WHEN AUTHORIZED)

### Step 1: Smart Contract Token Updates
```bash
export NEW_TOKEN=0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07
export PK=your_private_key

# Update PizzaPartyV2
cast send 0xA1C31c3eF1448351da0b1D430148660982B6f3dD \
  "adminSetPizzaToken(address)" $NEW_TOKEN \
  --private-key $PK --rpc-url https://mainnet.base.org

# Update PizzaStaking
cast send 0xCbAf5bACe5419710C3852653d3DdEB831d7415be \
  "adminSetPizzaToken(address)" $NEW_TOKEN \
  --private-key $PK --rpc-url https://mainnet.base.org

# PizzaParlorManager - NEEDS UPGRADE FIRST
```

### Step 2: Code Updates
```bash
./migration/token-migration.sh --execute 0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07
./migration/supply-migration.sh --execute
```

### Step 3: Deploy Frontend

### Step 4: Verify
```bash
cast call 0xA1C31c3eF1448351da0b1D430148660982B6f3dD "pizzaToken()(address)"
cast call 0xCbAf5bACe5419710C3852653d3DdEB831d7415be "pizzaToken()(address)"
curl "https://api.dexscreener.com/latest/dex/tokens/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07"
```

---

## Rollback (If Needed)
```bash
# Restore old token
export OLD_TOKEN=0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69
cast send 0xA1C31c3eF1448351da0b1D430148660982B6f3dD "adminSetPizzaToken(address)" $OLD_TOKEN ...
cast send 0xCbAf5bACe5419710C3852653d3DdEB831d7415be "adminSetPizzaToken(address)" $OLD_TOKEN ...

# Restore code from backups in migration/backups/
```

---

## STATUS: AWAITING GO SIGNAL
