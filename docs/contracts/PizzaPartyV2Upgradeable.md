# PizzaPartyV2Upgradeable

Daily lottery + weekly jackpot + toppings accrual. The core game contract.

**Last verified on-chain: April 23, 2026**

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`
- No Pausable — cannot be frozen
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor calls `_disableInitializers()`
- Solidity: 0.8.24

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | `0xA1C31c3eF1448351da0b1D430148660982B6f3dD` |
| Current implementation | `0xe1aa82fe48730c6926af1030b718a06143db7bf0` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |

## On-Chain State (verified live)

| Variable | Value |
|---|---|
| `dailyGameId` | 130 |
| `weeklyGameId` | 19 |
| `noonPacificUtcHour` | 19 (PDT — set to 20 for PST in November) |
| `treasuryWallet` | `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292` |
| `ownerFeeRecipient` | `0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b` (parlor manager, for owner fee distribution) |
| `stakingContract` | `0xCbAf5bACe5419710C3852653d3DdEB831d7415be` |
| `shareAndSpinContract` | `0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C` |
| `parlorManager` | `0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b` |
| `stakingFeeBPS` | **100 (1%)** |
| `parlorFeeBPS` | **0** (currently disabled) |
| `ownerFeeBPS` | **300 (3%)** |
| `currentDailyPot` | ~40.99M PIZZA |
| `holdingsUnitPizza` | ~24.26M PIZZA (1 topping per this amount of PIZZA held) |
| `toppingUnitPizza` | ~76,336 PIZZA (per topping at claim) |
| `weeklyTreasuryBonus` | ~4.495M PIZZA (~$20 at current price) |

## Purpose

- **Daily lottery:** players enter with PIZZA, 8 winners split 80% of pot
- **Weekly jackpot:** accumulates toppings over the week, 10 winners split weighted pot at Monday noon PT
- **Toppings:** earned via daily entry, holdings bonus, parlor slices — claimed weekly as PIZZA
- **Integration hub:** links staking, parlor manager, share-and-spin

## Core Constants (immutable in code)

```solidity
DAILY_WINNERS = 8
WEEKLY_WINNERS = 10
PLAYERS_POOL_BPS = 8000  // 80% to daily winners
STAKING_POOL_BPS = 1000  // 10% maximum — actual `stakingFeeBPS` is 100 (1%)
MAX_OWNER_FEE_BPS = 700  // 7% max — actual `ownerFeeBPS` is 300 (3%)
CHARITY_TOTAL_BPS = 300  // 3% to charities
MAX_CHARITIES = 20
HOLDINGS_TOPPINGS = 1      // base toppings per holdings unit
HOLDINGS_MAX_TOPPINGS = 5  // max holdings-based toppings/week
```

**Note:** the constants `STAKING_POOL_BPS` and `MAX_OWNER_FEE_BPS` define caps. The actual fees used are in `stakingFeeBPS` and `ownerFeeBPS` storage variables (settable by admin).

## Storage Layout (Append-Only — do not reorder)

See source `foundry/src/PizzaPartyV2Upgradeable.sol` for exact order. High-level layout in declaration order:

- `treasuryWallet`, `ownerFeeBPS`, `ownerFeeRecipient`, `noonPacificUtcHour`
- `dailyGameId`, `weeklyGameId`, `currentDailyPot`, `holdingsUnitPizza`
- `dailyGames[gameId]`, `weeklyGames[weekId]`
- `hasPlayedDaily[gameId][player]`, `weeklyPlayers[weekId][player]`, `playerStats[player]`
- `playerReferralCode[player]`, `codeToPlayer[string]`, `hasUsedReferral[player]` — **DEPRECATED** (referral system disabled April 2026; storage preserved)
- `dailyGameUsdValue[gameId]`, `weeklyGameUsdValue[weekId]` — USD cent snapshot at settlement
- `parlorManager`
- `dailySliceSponsor[gameId][player]`
- `firstSliceSponsor[player]`, `firstClaimWeekId[player]` — **DEPRECATED**
- `hasSlicedPlayer[sponsor][player]`, `weeklySliceSponsor[weekId][player]`
- `toppingUnitPizza`
- `weeklyTreasuryBonus`
- `stakingContract`, `stakingFeeBPS`, `parlorFeeBPS`
- `shareAndSpinContract` (slot appended April 2026 for bridge)

## Critical Functions

### Daily Game

| Function | Caller | Purpose |
|---|---|---|
| `enterDailyGame(amount, "")` | Player | Pay PIZZA, enter today's lottery |
| `enterDailyGameWithPermit(...)` | Player | Same with EIP-2612 permit (no separate approve tx) |
| `enterDailyWithSlice(player, sponsor, amount)` | `onlyParlorManager` | Sponsored entry via parlor slice |
| `enterDailyFromShareAndSpin(player, entryFee)` | `onlyShareAndSpin` | Sponsored entry from Share & Spin free slice |
| `settleDailyGame()` | Public fallback | Picks 8 winners, distributes pot |
| `settleDailyGameWithUsd(usdCentsPerWinner)` | **`onlyOwner`** | Settles + snapshots USD value (cron calls this) |

### Weekly Game

| Function | Caller | Purpose |
|---|---|---|
| `claimToppings()` | Player | Claim accumulated toppings as PIZZA |
| `settleWeeklyGame()` | Public fallback | Picks 10 weighted winners at Monday noon PT |
| `settleWeeklyGameWithUsd(usdCents)` | **`onlyOwner`** | Settles + snapshots USD |

### Bridge Functions (called by sister contracts)

| Function | Caller | Purpose |
|---|---|---|
| `addToppingsFromShareAndSpin(player, amount)` | `onlyShareAndSpin` | Share-and-spin adds toppings to player |
| `enterDailyFromShareAndSpin(player, entryFee)` | `onlyShareAndSpin` | Free slice enters player from treasury |

### Admin Setters

- `setNoonPacificUtcHour(19 or 20)` — DST switch
- `setHoldingsUnitPizza(n)` — price-linked holdings threshold
- `setToppingUnitPizza(n)` — price-linked topping reward
- `setWeeklyTreasuryBonus(n)` — treasury bonus amount (~$20)
- `adminSetStakingContract(addr)`
- `adminSetParlorManager(addr)`
- `adminSetShareAndSpinContract(addr)`
- `adminFixDailyGamePlayers(...)` — removes banned players before settlement

## Reward Split (Daily Pot Settlement)

- 80% → 8 winners (random)
- `stakingFeeBPS` (currently 1%) → staking contract via `notifyRewardAmount`
- `ownerFeeBPS` (currently 3%) → `ownerFeeRecipient` (parlor manager)
- 3% → charities
- Remainder routes via parlor fee pool

## Settlement Flow

1. Cron `/api/cron/settle-game` runs at 19:01 UTC (PDT) / 20:01 UTC (PST)
2. Calls `adminFixDailyGamePlayers` to remove banned wallets
3. Calls `settleDailyGameWithUsd(currentUsdCentsPerWinner)`
4. Contract: picks 8 winners, distributes splits, starts next daily game, snapshots USD

## Integration Points

- **→ PizzaStakingV1:** calls `stakingContract.notifyRewardAmount(amount)` during settlement
- **→ ParlorManager:** fees accrued and distributed to parlor owners
- **→ ShareAndSpin:** bridge functions for free slice entries and toppings
- **← Treasury:** `weeklyTreasuryBonus` PIZZA pulled at weekly game start

## Known History

- **Referral system disabled (April 2026):** function bodies emptied, storage preserved per append-only rule. Replaced by Share & Spin.
- **`settleDailyGameWithUsd` and `settleWeeklyGameWithUsd` gated to `onlyOwner` (April 2026):** previously callable publicly with external params, tightened after exploit audit.
- **`shareAndSpinContract` slot appended (April 2026):** bridge for Share & Spin integration.
- **Contract size:** ~22,719 bytes (limit 24,576). Every new state variable costs bytes.

## Files

- `foundry/src/PizzaPartyV2Upgradeable.sol` (1464 lines)
- ABI + address: `app/lib/constants/index.tsx`
- Settlement cron: `app/api/cron/settle-game/route.ts`, `app/api/cron/settle-weekly/route.ts`
