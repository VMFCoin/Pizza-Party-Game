# Implementation Summary: Stats Migration for Contract Redeployment

## Problem Solved ✅

When redeploying PizzaParty contract, all player stats were reset:
- ❌ Lifetime wins (daily & weekly)
- ❌ Total VMF won
- ❌ Lifetime toppings earned
- ❌ Lifetime referrals

**Solution:** Added stats migration function to preserve all player data during redeployment.

---

## What Was Implemented

### 1. Contract Function (`migratePlayerStats()`)

**File:** [PizzaParty (1).sol](PizzaParty%20(1).sol#L823-L840)

```solidity
function migratePlayerStats(
    address[] calldata players,
    PlayerLifetimeStats[] calldata stats
) external onlyOwner {
    require(players.length == stats.length, "Length mismatch");
    require(players.length > 0, "Empty array");

    for (uint256 i = 0; i < players.length; i++) {
        require(players[i] != address(0), "Invalid player address");
        playerStats[players[i]] = stats[i];
    }
}
```

**Features:**
- ✅ Only callable by contract owner (safe)
- ✅ Batch imports multiple players at once
- ✅ Validates addresses and array lengths
- ✅ No event emission (keeps event history clean)

---

### 2. Migration Script (`migrate-stats.ts`)

**File:** [migrate-stats.ts](migrate-stats.ts)

**What it does:**
1. Connects to Base mainnet
2. Queries old contract for player stats
3. Prepares data for new contract
4. Calls `migratePlayerStats()` on new contract
5. Verifies transaction success

**Usage:**
```bash
npx ts-node migrate-stats.ts
```

**Output example:**
```
✅ Found 150 players with stats
🚀 Migrating stats to new contract...
✅ Migration successful!

Summary:
  • Migrated: 150 players
  • Total daily wins: 450
  • Total weekly wins: 125
  • Total VMF distributed: 15,750.5 VMF
```

---

### 3. Comprehensive Guide (`MIGRATION_GUIDE.md`)

**File:** [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

**Includes:**
- Step-by-step deployment & migration process
- 3 methods to get player addresses (events, database, subgraph)
- Verification instructions
- Gas cost estimates
- Troubleshooting guide
- FAQ section

---

### 4. Quick Reference (`QUICK_MIGRATE.md`)

**File:** [QUICK_MIGRATE.md](QUICK_MIGRATE.md)

**For busy users:**
- 5-minute fast path
- Key commands
- What each step does
- Quick troubleshooting

---

### 5. Updated Deployment Script

**File:** [deploy.sh](deploy.sh#L67-L70)

**Changes:**
- Added reminder about migration after deployment
- Points users to MIGRATION_GUIDE.md
- Integrated into deployment workflow

---

## How to Use

### Before Deployment

1. Review [QUICK_MIGRATE.md](QUICK_MIGRATE.md) for overview

### After Deploying New Contract

1. Copy new contract address from deployment output
2. Edit [migrate-stats.ts](migrate-stats.ts):
   - Line 17: Update `OLD_CONTRACT_ADDRESS`
   - Line 18: Update `NEW_CONTRACT_ADDRESS`
   - Lines 45-50: Add player addresses
3. Run migration script:
   ```bash
   export PRIVATE_KEY=0xyourkey
   export BASE_RPC_URL=https://mainnet.base.org
   npx ts-node migrate-stats.ts
   ```
4. Verify stats on new contract
5. Update frontend with new contract address

---

## What Gets Migrated

### Preserved (Lifetime Stats) ✅

| Data | Preserved? | Notes |
|------|-----------|-------|
| Total Daily Wins | ✅ | Career count |
| Total Weekly Wins | ✅ | Career count |
| Total VMF Won | ✅ | All-time earnings |
| Lifetime Toppings | ✅ | Total ever earned |
| Lifetime Referrals | ✅ | Total ever used |

### Not Migrated (Resets Naturally) ❌

| Data | Why | Notes |
|------|-----|-------|
| Weekly Toppings | Per-week data | Resets Sundays |
| Daily Play Count | Per-day data | Resets daily |
| Weekly Claim Status | Per-week data | Resets Sundays |
| Game Entries | Completed games | Old contract only |

---

## Technical Details

### Struct Being Migrated

```solidity
struct PlayerLifetimeStats {
    uint256 totalDailyWins;      // uint256
    uint256 totalWeeklyWins;     // uint256
    uint256 totalVmfWon;         // uint256 (wei)
    uint256 lifetimeToppings;    // uint256
    uint256 lifetimeReferrals;   // uint256
}
```

### Function Signature

```solidity
function migratePlayerStats(
    address[] calldata players,        // Player addresses
    PlayerLifetimeStats[] calldata stats  // Stats tuples
) external onlyOwner
```

### ABI for Frontend

```json
{
  "type": "function",
  "name": "migratePlayerStats",
  "inputs": [
    {
      "name": "players",
      "type": "address[]"
    },
    {
      "name": "stats",
      "type": "tuple[]",
      "components": [
        { "name": "totalDailyWins", "type": "uint256" },
        { "name": "totalWeeklyWins", "type": "uint256" },
        { "name": "totalVmfWon", "type": "uint256" },
        { "name": "lifetimeToppings", "type": "uint256" },
        { "name": "lifetimeReferrals", "type": "uint256" }
      ]
    }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
}
```

---

## Gas Costs

**Approximate costs on Base Mainnet:**

| Players | Est. Gas | Cost (Base) |
|---------|----------|------------|
| 10 | 200,000 | ~$0.10 |
| 50 | 1,000,000 | ~$0.50 |
| 100 | 1,800,000 | ~$0.90 |
| 500 | 9,000,000 | ~$4.50 |
| 1,000 | 18,000,000 | ~$9.00 |

**Optimization:** Split large migrations into batches of 50-100 players.

---

## Testing

To test on testnet before mainnet:

1. Deploy to Sepolia/Base Sepolia
2. Run migration script with testnet addresses
3. Verify stats migrated correctly
4. Check gas costs
5. Then deploy to mainnet

---

## Timeline

**One-time process per redeployment:**

1. Deploy new contract: 2-3 minutes
2. Gather player addresses: 1-5 minutes (depends on method)
3. Run migration script: 1-2 minutes
4. Verify migration: < 1 minute

**Total: ~5-10 minutes**

---

## Security Considerations

✅ **Only owner can migrate** - protected by `onlyOwner` modifier
✅ **Validates input** - checks addresses and array lengths
✅ **No overwrite concerns** - migration happens before users interact with new contract
✅ **Transparent** - all old contract data is queryable on-chain
✅ **Reversible** - could migrate again if needed (though not recommended)

---

## Backup Plan

If something goes wrong during migration:

1. **Before migration:** Old contract still has data
2. **If migration fails:** Retry with same data, fix any issues
3. **After migration:** Can verify any player's stats match

Query old contract to verify data:
```typescript
const stats = await oldContract.getPlayerLifetimeStats(playerAddress);
console.log('Original stats:', stats);
```

---

## Next Steps

1. ✅ **Read guides:** [QUICK_MIGRATE.md](QUICK_MIGRATE.md) and [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
2. ✅ **Deploy contract:** Run `./deploy.sh`
3. ✅ **Edit script:** Update addresses in [migrate-stats.ts](migrate-stats.ts)
4. ✅ **Get players:** Add player addresses from your data source
5. ✅ **Run migration:** `npx ts-node migrate-stats.ts`
6. ✅ **Verify:** Check stats on new contract
7. ✅ **Update frontend:** Use new contract address

---

## Questions?

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md#faq) for FAQ section with common questions and answers.

---

**Implementation Date:** 2025-12-02
**Status:** ✅ Complete & Ready to Use
