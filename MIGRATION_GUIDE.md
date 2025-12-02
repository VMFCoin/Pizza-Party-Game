# PizzaParty Contract Migration Guide

## Overview

When deploying a new PizzaParty contract, player stats (lifetime wins, daily/weekly entries, VMF amounts) will be reset unless you explicitly migrate them. This guide shows you how to preserve all player data.

## What Gets Preserved

The migration preserves these **lifetime stats** for each player:

- ✅ **Total Daily Wins** - count of daily games won
- ✅ **Total Weekly Wins** - count of weekly games won
- ✅ **Total VMF Won** - total VMF tokens earned from games
- ✅ **Lifetime Toppings** - total toppings ever earned
- ✅ **Lifetime Referrals** - total successful referrals

## What Does NOT Get Migrated

These are per-game/per-week data that reset naturally:

- ❌ **Weekly toppings earned** (resets each week)
- ❌ **Daily play history** (resets each day)
- ❌ **Weekly claim status** (resets each week)
- ❌ **Active game entries** (games settle after each cycle)

This is intentional - players should start fresh for the current week/day while keeping their lifetime achievements.

---

## Step-by-Step Migration Process

### 1. Deploy New Contract

First, deploy your new PizzaParty contract:

```bash
cd foundry
forge script script/DeployPizzaParty.s.sol:DeployPizzaParty \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify
```

**Save the new contract address** - you'll need this for the next step.

Example output:
```
PizzaParty deployed at: 0xNEWADDRESSHERE
```

### 2. Update Migration Script

Edit `migrate-stats.ts` and update these values:

```typescript
// Line 17-18: Update these addresses
const OLD_CONTRACT_ADDRESS = "0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7"; // Your previous contract
const NEW_CONTRACT_ADDRESS = "0xNEWADDRESSHERE"; // From step 1
```

### 3. Get Player Addresses

You need a list of all player addresses who have stats to migrate. **Choose one approach:**

#### Option A: Query Events (Recommended)

Query events from the old contract to find all players:

```typescript
// In migrate-stats.ts, replace the playerAddresses array with:

const provider = new ethers.JsonRpcProvider(RPC_URL);
const oldContract = new ethers.Contract(OLD_CONTRACT_ADDRESS, PIZZA_PARTY_ABI, provider);

// Get all unique players from DailyGameEntered events
const dailyLogs = await provider.getLogs({
  address: OLD_CONTRACT_ADDRESS,
  topics: [ethers.id('DailyGameEntered(uint256,address,bool,uint256)')],
  fromBlock: <START_BLOCK>, // When contract was deployed
  toBlock: 'latest'
});

const playerSet = new Set<string>();
dailyLogs.forEach(log => {
  const player = '0x' + log.topics[2].slice(26); // Extract address from topic
  playerSet.add(ethers.getAddress(player)); // Checksum format
});

const playerAddresses = Array.from(playerSet);
```

#### Option B: Export from Database

If you maintain an off-chain database of players:

```typescript
const playerAddresses = await database.getAllPlayerAddresses();
```

#### Option C: Use The Graph

If you have a subgraph deployed:

```typescript
const query = `
  query {
    players {
      id
    }
  }
`;
const result = await fetch('<SUBGRAPH_URL>', { method: 'POST', body: JSON.stringify({ query }) });
const playerAddresses = result.data.players.map(p => ethers.getAddress(p.id));
```

### 4. Run Migration Script

```bash
# Install dependencies (if not already installed)
npm install ethers

# Set environment variables
export PRIVATE_KEY=0xyourprivatekey
export BASE_RPC_URL=https://mainnet.base.org

# Run migration
npx ts-node migrate-stats.ts
```

**Output:**
```
🍕 PizzaParty Stats Migration
==============================

📡 Connected to Base Mainnet
👤 Signer address: 0x...

📋 OLD Contract: 0x5432260CfcAc5C45773449089EA603a6e5Dc7DA7
✨ NEW Contract: 0xNEWADDRESSHERE

⏳ Querying player stats from old contract...
📊 Fetching stats for 150 players...

  ✓ 0x123...: 5 daily wins, 2 weekly wins, 150.5 VMF won
  ✓ 0x456...: 3 daily wins, 1 weekly wins, 89.25 VMF won
  ...

✅ Found 150 players with stats

🚀 Migrating stats to new contract...
📝 Transaction submitted: 0xabcd...
⏳ Waiting for confirmation...

✅ Migration successful!

Summary:
  • Migrated: 150 players
  • Total daily wins: 450
  • Total weekly wins: 125
  • Total VMF distributed: 15,750.5 VMF
  • Block: 12345678

🎉 All player stats have been preserved on the new contract!
```

### 5. Verify Migration

Check that stats were migrated correctly:

```typescript
// Query the new contract for a player's stats
const stats = await newContract.getPlayerLifetimeStats('0xPlayerAddress');
console.log('Daily wins:', stats.totalDailyWins);
console.log('Weekly wins:', stats.totalWeeklyWins);
console.log('VMF won:', ethers.formatEther(stats.totalVmfWon));
```

Or use a block explorer:
1. Go to [BaseScan](https://basescan.org/)
2. Search for your new contract address
3. Call `getPlayerLifetimeStats()` with a player address
4. Verify the stats match the old contract

### 6. Update Frontend

Update your frontend config to use the new contract address:

```typescript
// In your app config
const PIZZA_PARTY_ADDRESS = "0xNEWADDRESSHERE";
```

---

## How Migration Works

The `migratePlayerStats()` function in the contract:

```solidity
function migratePlayerStats(
    address[] calldata players,
    PlayerLifetimeStats[] calldata stats
) external onlyOwner {
    require(players.length == stats.length, "Length mismatch");

    for (uint256 i = 0; i < players.length; i++) {
        playerStats[players[i]] = stats[i];
    }
}
```

This function:
- ✅ Only callable by contract owner (safe)
- ✅ Batch imports player stats
- ✅ Overwrites any existing stats for those players
- ✅ Emits no events (to keep event history clean)

## Timing

**When to run migration:**
- ✅ **After deploying new contract** (immediately)
- ✅ **Before users interact with new contract** (so fresh players aren't overwritten)
- ❌ **NOT after users start playing** (would overwrite their new progress)

**If you miss the timing:** You can still migrate later, but:
- Player stats from the new contract will be preserved (not overwritten)
- The migration script should only include stats from OLD contract
- Manual cleanup may be needed

## Cost

**Gas costs depend on number of players:**

- 10 players: ~200,000 gas (~$0.10)
- 100 players: ~1,800,000 gas (~$0.90)
- 1,000 players: ~18,000,000 gas (~$9.00)
- Batch size limit: ~50-100 players per transaction (check your network)

**Optimization:** If migrating many players, split into multiple transactions:

```typescript
const BATCH_SIZE = 50;
for (let i = 0; i < playerAddresses.length; i += BATCH_SIZE) {
  const batch = playerAddresses.slice(i, i + BATCH_SIZE);
  const statsBatch = statsArray.slice(i, i + BATCH_SIZE);
  await newContract.migratePlayerStats(batch, statsBatch);
}
```

## Troubleshooting

### "NEW_CONTRACT_ADDRESS is not set!"

**Solution:** Update line 18 in `migrate-stats.ts` with your new contract address.

### "No players with stats found!"

**Possible causes:**
- Player addresses list is empty
- Old contract address is wrong
- Old contract has no players with stats

**Solution:**
- Double-check player addresses in the script
- Verify OLD_CONTRACT_ADDRESS matches your previous deployment
- Query old contract manually to confirm it has stats

### "Migration transaction failed!"

**Check:**
1. Signer (deployer) is the contract owner
2. Private key is correct
3. Have sufficient gas (Base mainnet ~$1)
4. Number of players isn't too large (split into smaller batches)

### "Stats don't match after migration"

**Verify:**
1. Query both old and new contracts: `getPlayerLifetimeStats(player)`
2. Stats should be identical
3. If not, check transaction receipt to confirm migration happened

---

## FAQ

**Q: Do I need to migrate every time I redeploy?**
A: Only if you want to preserve player stats. If starting fresh is intended, no migration needed.

**Q: Will migration affect ongoing games?**
A: No. Migration only imports lifetime stats. Weekly/daily games are independent per-contract.

**Q: Can I migrate multiple times?**
A: Yes. Each call overwrites stats for the provided players. Only call once to avoid confusion.

**Q: What about referral codes?**
A: Referral codes are deterministically generated, so they work on any deployment of the same contract code. No migration needed for codes.

**Q: Can I migrate from a proxy contract?**
A: Yes. If using a proxy, query the implementation contract's data.

---

## Support

Need help with migration? Check:
1. Review this guide completely
2. Look at `migrate-stats.ts` comments
3. Test on testnet first (Sepolia)
4. Check contract events: `getPlayerLifetimeStats()`

---

**Remember:** This is a one-time operation per contract upgrade. Plan it carefully!
