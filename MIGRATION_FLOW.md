# Migration Flow Diagram

## Contract Redeployment with Stats Migration

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT SEQUENCE                          │
└─────────────────────────────────────────────────────────────────┘

BEFORE: Old Contract Still Active
┌──────────────────────────────────┐
│  OLD CONTRACT                    │
│  (0x5432260CfcAc5C45773449089EA)│
│                                  │
│  Players Active ✅               │
│  - 150 players with stats        │
│  - Total wins: 450 daily         │
│  - Total wins: 125 weekly        │
│  - Total VMF: 15,750.5           │
└──────────────────────────────────┘

                  ▼
         [Step 1: Deploy]
                  ▼

NEW CONTRACT DEPLOYED
┌──────────────────────────────────┐
│  NEW CONTRACT                    │
│  (0xNEWADDRESSHERE)              │
│                                  │
│  Fresh State (Empty) ❌          │
│  - No players                    │
│  - All stats at 0                │
│  - Games ready to play           │
└──────────────────────────────────┘

                  ▼
    [Step 2-4: Prepare Migration]
                  ▼

MIGRATION SCRIPT READY
┌────────────────────────────────────────────────────────────────┐
│  migrate-stats.ts                                              │
│                                                                │
│  OLD:   0x5432260CfcAc5C45773449089EA                         │
│  NEW:   0xNEWADDRESSHERE                                       │
│  Players: [0xAddr1, 0xAddr2, ..., 0xAddr150]                 │
│  Stats:   [Stats1, Stats2, ..., Stats150]                     │
└────────────────────────────────────────────────────────────────┘

                  ▼
          [Step 5: Execute]
                  ▼

MIGRATION TRANSACTION
┌────────────────────────────────────────────────────────────────┐
│  newContract.migratePlayerStats(                              │
│    [0xAddr1, 0xAddr2, ..., 0xAddr150],                        │
│    [Stats1, Stats2, ..., Stats150]                            │
│  )                                                             │
│                                                                │
│  Transaction: 0xabcd...                                       │
│  Status: Confirmed ✅                                         │
│  Block: 12345678                                              │
│  Gas Used: 1,800,000                                          │
└────────────────────────────────────────────────────────────────┘

                  ▼
      [Step 6: Verify & Activate]
                  ▼

FINAL STATE: Stats Preserved! 🎉
┌──────────────────────────────────┐
│  NEW CONTRACT (Active)           │
│  (0xNEWADDRESSHERE)              │
│                                  │
│  Players Restored ✅             │
│  - 150 players migrated          │
│  - Daily wins: 450               │
│  - Weekly wins: 125              │
│  - Total VMF: 15,750.5           │
│                                  │
│  Users Playing ✅                │
│  - New games active              │
│  - Weekly reset Sunday            │
│  - Fresh daily cycles            │
└──────────────────────────────────┘
```

---

## Data Migration Flow

```
OLD CONTRACT                    MIGRATION                NEW CONTRACT
(Read-only)                     (Script)                 (Write)

┌─────────────────┐
│ playerStats[    │
│  0xPlayer1      │  ─────────┐
│ ] = {           │  Query    │
│  wins: 5,       │           │  ┌──────────────────┐
│  vmf: 150.5,    │           └─>│ migrate-stats.ts │
│  toppings: 42   │              │                  │
│ }               │              │ Data Transform:  │
│                 │              │ Validate         │
│ playerStats[    │              │ Batch            │
│  0xPlayer2      │  ─────────┐  │ Encode           │
│ ] = {           │  Query    │  │                  │
│  wins: 3,       │           │  └──────────────────┘
│  vmf: 89.25,    │           │         │
│  toppings: 28   │           │         │
│ }               │           │         │ Call
│                 │  Query    │         │ migratePlayerStats()
│ ...             │───────────┘         │
│                 │                     ▼
│                 │              ┌─────────────────┐
└─────────────────┘              │  New Contract   │
                                 │                 │
                                 │ playerStats[    │
                                 │  0xPlayer1      │
                                 │ ] = {           │
                                 │  wins: 5,       │
                                 │  vmf: 150.5,    │
                                 │  toppings: 42   │
                                 │ }               │
                                 │                 │
                                 │ playerStats[    │
                                 │  0xPlayer2      │
                                 │ ] = {           │
                                 │  wins: 3,       │
                                 │  vmf: 89.25,    │
                                 │  toppings: 28   │
                                 │ }               │
                                 │                 │
                                 │ ...             │
                                 └─────────────────┘
```

---

## Timeline

```
Day 1: Deployment
┌─────────────────────────────────────────┐
│ 10:00 AM - Deploy new contract          │ ← ./deploy.sh
│ 10:05 AM - Verify on BaseScan           │
│ 10:10 AM - Update migration script      │ ← Edit migrate-stats.ts
│ 10:15 AM - Gather player addresses      │ ← Query events/database
│ 10:20 AM - Run migration                │ ← npx ts-node migrate-stats.ts
│ 10:25 AM - Verify stats migrated        │ ← Query new contract
│ 10:30 AM - Update frontend              │ ← New contract address
│ 10:35 AM - Users enjoy preserved stats! │ ✅
└─────────────────────────────────────────┘
```

---

## What Happens to Different Data

```
PLAYER STATS MAPPING
├─ playerStats[address] (MIGRATED ✅)
│  ├─ totalDailyWins → ✅ MIGRATED
│  ├─ totalWeeklyWins → ✅ MIGRATED
│  ├─ totalVmfWon → ✅ MIGRATED
│  ├─ lifetimeToppings → ✅ MIGRATED
│  └─ lifetimeReferrals → ✅ MIGRATED
│
├─ weeklyPlayers[gameId][address] (NOT MIGRATED ❌)
│  ├─ toppingsEarned → ❌ Resets (per-week)
│  ├─ toppingsClaimed → ❌ Resets (per-week)
│  ├─ dailyPlays → ❌ Resets (per-week)
│  ├─ referralsUsed → ❌ Resets (per-week)
│  └─ hasClaimed → ❌ Resets (per-week)
│
├─ hasPlayedDaily[gameId][address] (NOT MIGRATED ❌)
│  └─ → ❌ Resets (per-day)
│
├─ dailyGames[gameId] (NOT MIGRATED ❌)
│  └─ → ❌ Fresh games start
│
└─ weeklyGames[gameId] (NOT MIGRATED ❌)
   └─ → ❌ Fresh games start

RESULT:
✅ LIFETIME STATS PRESERVED (Career achievements)
❌ WEEKLY/DAILY DATA RESETS (Natural cycle)
✅ GAMES CONTINUE PLAYING (From week 1, day 1)
```

---

## Gas Cost Breakdown

```
Fixed Cost (per transaction)
├─ Function call overhead: ~21,000 gas
└─ Array setup/validation: ~30,000 gas
   ├─ Check lengths: 1,000 gas
│  └─ Loop setup: 2,000 gas

Variable Cost (per player)
└─ 1 player: 18,000 gas
   ├─ Load player address: 3,000 gas
   ├─ Load stats struct (5 uint256s): 10,000 gas
   ├─ Store in mapping: 20,000 gas (warm) / 20,000 gas (cold)
   └─ Address validation: 100 gas

Total Examples:
├─ 10 players: ~21,000 + 30,000 + (10 × 18,000) = 211,000 gas
├─ 50 players: ~21,000 + 30,000 + (50 × 18,000) = 941,000 gas
├─ 100 players: ~21,000 + 30,000 + (100 × 18,000) = 1,851,000 gas
└─ 500 players: ~21,000 + 30,000 + (500 × 18,000) = 9,051,000 gas
```

---

## Error Handling Flowchart

```
Run migrate-stats.ts
       │
       ▼
   ┌─────────┐
   │ Validate│
   │ Inputs  │
   └────┬────┘
        │
        ├─ NEW_CONTRACT_ADDRESS not set?
        │  └─→ ❌ "Error: address not configured"
        │
        ├─ Player addresses empty?
        │  └─→ ⚠️ "Warning: No players to migrate"
        │
        ├─ RPC connection failed?
        │  └─→ ❌ "Error: Cannot connect to RPC"
        │
        └─ All valid ✅
           │
           ▼
        ┌─────────┐
        │ Query   │
        │ Old     │
        │ Contract│
        └────┬────┘
             │
             ├─ OLD_CONTRACT_ADDRESS invalid?
             │  └─→ ❌ "Error: Invalid contract address"
             │
             ├─ No stats found?
             │  └─→ ⚠️ "Warning: 0 players with stats"
             │
             └─ Stats fetched ✅
                │
                ▼
             ┌──────────────┐
             │ Send Migrate │
             │ Transaction  │
             └────┬─────────┘
                  │
                  ├─ Not contract owner?
                  │  └─→ ❌ "Error: Caller is not owner"
                  │
                  ├─ Array length mismatch?
                  │  └─→ ❌ "Error: Length mismatch"
                  │
                  ├─ Insufficient gas?
                  │  └─→ ❌ "Error: Out of gas"
                  │
                  ├─ Invalid address in array?
                  │  └─→ ❌ "Error: Invalid player address"
                  │
                  └─ Transaction sent ✅
                     │
                     ▼
                  ┌──────────────┐
                  │ Wait for     │
                  │ Confirmation │
                  └────┬─────────┘
                       │
                       ├─ Transaction reverted?
                       │  └─→ ❌ "Error: Migration failed"
                       │
                       └─ Success ✅
                          │
                          ▼
                       ┌──────────────┐
                       │ ✅ Migrate   │
                       │ Complete!    │
                       └──────────────┘
```

---

## Before & After Comparison

```
┌──────────────────────────────────────────────────────────────┐
│ BEFORE DEPLOYMENT                                            │
├──────────────────────────────────────────────────────────────┤
│ Contract Address: 0x5432260CfcAc5C45773449089EA              │
│ Status: ✅ Active                                             │
│ Players: 150                                                 │
│ Total Wins: 450 daily, 125 weekly                            │
│ Total VMF Won: 15,750.5                                      │
│ Daily Game: #127                                             │
│ Weekly Game: #18                                             │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ Deploy + Migrate
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ AFTER DEPLOYMENT + MIGRATION                                 │
├──────────────────────────────────────────────────────────────┤
│ Old Contract: 0x5432260CfcAc5C45773449089EA                  │
│ Status: ⚪ Deprecated (history only)                         │
│                                                              │
│ New Contract: 0xNEWADDRESSHERE                               │
│ Status: ✅ Active                                             │
│ Players: 150 (migrated) ✅                                    │
│ Total Wins: 450 daily, 125 weekly (preserved) ✅             │
│ Total VMF Won: 15,750.5 (preserved) ✅                       │
│ Daily Game: #1 (fresh start)                                 │
│ Weekly Game: #1 (fresh start)                                │
│                                                              │
│ Users see:                                                   │
│ ✅ Career stats preserved                                    │
│ ✅ Leaderboards show real history                            │
│ ✅ Can play new games immediately                            │
│ ✅ New weekly/daily cycles active                            │
└──────────────────────────────────────────────────────────────┘
```

---

This helps visualize the entire migration process! 🍕
