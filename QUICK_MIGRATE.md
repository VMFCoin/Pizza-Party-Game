# Quick Migration Checklist (5 Minutes)

## TL;DR - Fast Path

```bash
# 1. Deploy new contract
./deploy.sh

# 2. Save the NEW address printed at end
# Example: 0xNEWADDRESSHERE

# 3. Edit migrate-stats.ts (line 17-18)
# Update: OLD_CONTRACT_ADDRESS = "0x..." (your previous contract)
# Update: NEW_CONTRACT_ADDRESS = "0xNEWADDRESSHERE" (from step 2)

# 4. Get player addresses (option A: query events)
# Add this to migrate-stats.ts playerAddresses array:
# [Get from your database, events, or subgraph]

# 5. Run migration
export PRIVATE_KEY=0xyourprivatekey
export BASE_RPC_URL=https://mainnet.base.org
npx ts-node migrate-stats.ts

# 6. Done! ✅ Stats are preserved
```

---

## What Each Step Does

| Step | What | Time |
|------|------|------|
| 1. Deploy | Create new contract on chain | 2 min |
| 2. Save | Note the new address | < 1 min |
| 3. Edit | Update contract addresses in script | 1 min |
| 4. Gather | Get list of player addresses | 1-5 min |
| 5. Migrate | Transfer stats to new contract | 1 min |
| 6. Verify | Check stats on new contract | < 1 min |

---

## Key Commands

```bash
# Deploy
./deploy.sh

# Check environment
echo $PRIVATE_KEY
echo $BASE_RPC_URL

# Run migration
npx ts-node migrate-stats.ts

# Query stats after migration
# Use BaseScan: https://basescan.org/
# Contract > Read Contract > getPlayerLifetimeStats()
```

---

## Files Modified/Created

✅ [PizzaParty (1).sol](PizzaParty%20(1).sol#L823) - Added `migratePlayerStats()` function
✅ [migrate-stats.ts](migrate-stats.ts) - Migration script
✅ [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Detailed guide
✅ [deploy.sh](deploy.sh) - Updated with migration reminder

---

## Troubleshoot

**"Migration transaction failed?"**
→ Make sure you're the contract owner & have sufficient gas

**"No players found?"**
→ Add player addresses to `playerAddresses` array in script

**"Stats don't match?"**
→ Compare old & new contract: `getPlayerLifetimeStats(playerAddress)`

---

**That's it!** Your player stats are now preserved on the new contract. 🎉
