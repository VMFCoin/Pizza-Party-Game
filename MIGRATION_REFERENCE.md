# Migration Reference Card

## Function Signature

```solidity
function migratePlayerStats(
    address[] calldata players,
    PlayerLifetimeStats[] calldata stats
) external onlyOwner
```

---

## Data Structure

```solidity
struct PlayerLifetimeStats {
    uint256 totalDailyWins;      // Count of daily games won
    uint256 totalWeeklyWins;     // Count of weekly games won
    uint256 totalVmfWon;         // Total VMF tokens earned (wei)
    uint256 lifetimeToppings;    // Total toppings earned
    uint256 lifetimeReferrals;   // Total referrals used
}
```

---

## Script Commands

### Setup
```bash
# Set environment variables
export PRIVATE_KEY=0xyourkey
export BASE_RPC_URL=https://mainnet.base.org

# Install dependencies (if not done)
npm install ethers
```

### Run Migration
```bash
# Execute migration script
npx ts-node migrate-stats.ts

# Or with env variables inline
PRIVATE_KEY=0x... BASE_RPC_URL=https://... npx ts-node migrate-stats.ts
```

### Verify After Migration
```typescript
// Query stats on new contract
const stats = await newContract.getPlayerLifetimeStats('0xPlayerAddress');
console.log({
  totalDailyWins: stats.totalDailyWins,
  totalWeeklyWins: stats.totalWeeklyWins,
  totalVmfWon: ethers.formatEther(stats.totalVmfWon),
  lifetimeToppings: stats.lifetimeToppings,
  lifetimeReferrals: stats.lifetimeReferrals
});
```

---

## Configuration Checklist

- [ ] OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA" (your previous contract)
- [ ] NEW_CONTRACT_ADDRESS = "0xNEWADDRESSHERE" (newly deployed contract)
- [ ] RPC_URL = "https://mainnet.base.org"
- [ ] PRIVATE_KEY environment variable set
- [ ] Player addresses array populated
- [ ] Sufficient gas (depends on player count)

---

## Troubleshooting Quick Answers

| Problem | Solution |
|---------|----------|
| "NEW_CONTRACT_ADDRESS is not set!" | Update line 18 in migrate-stats.ts |
| "No players with stats found!" | Add addresses to playerAddresses array |
| "Invalid address at index..." | Check address format (should be checksum) |
| "Migration transaction failed!" | Verify you're contract owner & have gas |
| "Stats don't match after migration" | Compare queries: `getPlayerLifetimeStats()` |
| "Transaction reverted" | Check contract owner, array lengths, address validity |
| "Out of gas" | Reduce batch size (split into multiple transactions) |

---

## Batch Migration (for many players)

```typescript
const BATCH_SIZE = 50;
const totalBatches = Math.ceil(playerAddresses.length / BATCH_SIZE);

for (let i = 0; i < totalBatches; i++) {
  const start = i * BATCH_SIZE;
  const end = Math.min(start + BATCH_SIZE, playerAddresses.length);

  const batchAddresses = playerAddresses.slice(start, end);
  const batchStats = statsArray.slice(start, end);

  console.log(`Batch ${i + 1}/${totalBatches}: Migrating ${batchAddresses.length} players`);

  const tx = await newContract.migratePlayerStats(batchAddresses, batchStats);
  await tx.wait();

  console.log(`✅ Batch ${i + 1} complete`);
}
```

---

## Gas Estimation

```typescript
// Estimate gas before migrating
const gasEstimate = await newContract.migratePlayerStats.estimateGas(
  playerAddresses,
  statsArray
);
console.log(`Gas needed: ${gasEstimate.toString()}`);

// Calculate cost
const gasPrice = await provider.getGasPrice();
const cost = gasEstimate * gasPrice; // in wei
console.log(`Cost: ${ethers.formatEther(cost)} ETH`);
```

---

## Contract Events

Migration emits NO events (intentional, to keep event history clean from old contract).

To track migration:
- Monitor transaction hash
- Check block number
- Verify `playerStats` mapping updated on new contract

---

## Before Migration Checklist

- [ ] Deployed new contract ✅
- [ ] Saved new contract address ✅
- [ ] Old contract still has data ✅
- [ ] Have private key (contract owner) ✅
- [ ] Have list of player addresses ✅
- [ ] Enough gas on account ✅
- [ ] Script configured correctly ✅

---

## After Migration Checklist

- [ ] Transaction confirmed on-chain ✅
- [ ] Verified stats on new contract ✅
- [ ] Spot-checked 5+ players ✅
- [ ] Old contract still queryable (for backup) ✅
- [ ] Frontend updated with new address ✅
- [ ] Users notified of new contract ✅

---

## Verification Commands

```typescript
// Check player stats migrated correctly
const oldStats = await oldContract.getPlayerLifetimeStats(playerAddr);
const newStats = await newContract.getPlayerLifetimeStats(playerAddr);

console.assert(
  oldStats.totalDailyWins === newStats.totalDailyWins,
  'Daily wins mismatch!'
);
console.assert(
  oldStats.totalVmfWon === newStats.totalVmfWon,
  'VMF won mismatch!'
);

// Check weekly data was NOT migrated (expected)
const weeklyInfo = await newContract.getPlayerWeeklyInfo(playerAddr);
console.assert(
  weeklyInfo.toppingsEarned === 0n,
  'Weekly data should be reset'
);

console.log('✅ All checks passed!');
```

---

## Common Questions

**Q: How long does migration take?**
A: Typically 10-30 seconds per transaction (depends on network congestion)

**Q: Can I undo migration?**
A: You could call it again with different data, but not recommended. Verify before executing.

**Q: Do referral codes migrate?**
A: No - codes are deterministically generated, so they work on any deployment

**Q: Can users claim weekly rewards after migration?**
A: No - weekly game starts fresh (game #1), claim window resets

**Q: Do I need to migrate every time?**
A: Only if you want to preserve stats. Not required for redeployment.

**Q: What if migration fails?**
A: Retry with same data. Old contract data is safe (still queryable).

---

## File Locations

| File | Purpose |
|------|---------|
| [PizzaParty (1).sol](PizzaParty%20(1).sol) | Contract with migratePlayerStats() |
| [migrate-stats.ts](migrate-stats.ts) | Migration script |
| [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) | Detailed guide |
| [QUICK_MIGRATE.md](QUICK_MIGRATE.md) | Quick start |
| [MIGRATION_FLOW.md](MIGRATION_FLOW.md) | Visual diagrams |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | Full technical summary |
| [deploy.sh](deploy.sh) | Deployment script |

---

## Emergency Contacts

Having issues? Check:

1. **Documentation:** [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md#troubleshooting) - Troubleshooting section
2. **FAQ:** [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md#faq) - Common questions
3. **Scripts:** [migrate-stats.ts](migrate-stats.ts) - Code comments
4. **Diagrams:** [MIGRATION_FLOW.md](MIGRATION_FLOW.md) - Visual explanations

---

**Last Updated:** 2025-12-02
**Status:** ✅ Production Ready
