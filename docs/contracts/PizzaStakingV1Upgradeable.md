# PizzaStakingV1Upgradeable

Staking with tiered yield, 7-day lock option, Spin the Pie reward multiplier, and dynamic APY on locked positions.

**Last verified on-chain: April 23, 2026**

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`, `PausableUpgradeable`
- Pausable: Yes — `adminPause()` / `adminUnpause()` exist. Currently `paused = false`.
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor does NOT call `_disableInitializers()`
- Solidity: 0.8.24
- Sybil defense: `tx.origin == msg.sender` on `recordSpin`; $1 min stake across all operations

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | `0xCbAf5bACe5419710C3852653d3DdEB831d7415be` |
| Current implementation | `0xe26142D4f6c87FD7d3925A85F08028FFd339F1B1` (MAX_STAKE 20B) |
| Staking rewards wallet | `0x0b30b1D9327979D290b49BbfEF92f783fdE81c56` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |

## On-Chain State (verified live)

| Variable | Value |
|---|---|
| `pizzaToken` | `0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07` |
| `stakingRewardsWallet` | `0x0b30b1D9327979D290b49BbfEF92f783fdE81c56` |
| `pizzaPartyContract` | `0xA1C31c3eF1448351da0b1D430148660982B6f3dD` |
| `parlorManager` | `0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b` |
| `pizzaPriceMicroUsd` | 5008 (~$0.005008 per PIZZA) |
| `boostEndTime` | 1774551600 (Mar 26, 2026 — early staker boost already ended) |
| `lastJackpotGameId` | 130 (matches current dailyGameId → no more jackpots today) |
| `fidVerificationRequired` | **false** |
| `MAX_STAKE` | 20,000,000,000 * 1e18 (20B PIZZA) |
| `lockedApyBps` (override) | **2500 (25%)** |
| `LOCKED_APY_BPS` constant | 2000 (20% fallback) |
| `spinEnabled` | true |
| `maxSpinsPerDay` | 1 |
| `goldChancePct` | 0 (hidden gold off) |
| `stakerCount` | 268 |
| `totalStaked` | ~20.33B PIZZA |
| `bonusPool` | ~1026 PIZZA (small residual from old system) |
| Allowance `stakingRewardsWallet → staking` | ~189.9M PIZZA (capped, **NOT unlimited**) |
| `stakingRewardsWallet` PIZZA balance | ~12.94B PIZZA |

## Purpose

- Accept staked PIZZA (flexible or 7-day locked)
- Accrue rewards from a portion of daily pot (`notifyRewardAmount` called by PizzaPartyV2)
- Distribute rewards EQUALLY across all stakers (not proportional to stake size)
- Apply Spin the Pie multiplier when claiming (1x / 1.1x / 1.5x / 3x + 10M)
- Apply tier bonuses (+1.5% / +3% / +7% / +15%) + optional +5% lock bonus additively
- Pay 25% APY on locked positions (linear per-second)
- Three claim paths — all use committed spin outcome:
  - `claim()` / `claimAfterSpin()` → wallet
  - `restake(lockType)` → existing staking position

## Core Constants (immutable in code)

```solidity
MAX_STAKE = 20_000_000_000 * 1e18        // 20B PIZZA per wallet cap (raised from 10B April 2026)
MIN_STAKE_MICRO_USD = 1_000_000          // $1 minimum stake (sybil gate)
MIN_STAKE_FALLBACK = 10_000 * 1e18       // Used if price oracle hasn't set price

LOCK_DURATION = 7 days
EARLY_UNSTAKE_PENALTY_BPS = 1500         // 15%
LOCK_BONUS_BPS = 500                     // +5% spin bonus for locked positions
EARLY_BOOST_BPS = 3000                   // +30% early staker (first 60 days — ended)
LOCKED_APY_BPS = 2000                    // 20% APY fallback (ACTUAL: lockedApyBps = 2500 / 25%)
DAYS_PER_YEAR = 365

// Tier thresholds (by TOTAL staked = flex + locked)
TIER1_THRESHOLD = 500M PIZZA       // Oven Operator
TIER2_THRESHOLD = 2B PIZZA         // Pie Boss
TIER3_THRESHOLD = 5B PIZZA         // Pizza Tycoon

// Tier bonuses (additive to spun reward)
TIER0_BONUS_BPS = 150   // +1.5%  — Slice Runner
TIER1_BONUS_BPS = 300   // +3%    — Oven Operator
TIER2_BONUS_BPS = 700   // +7%    — Pie Boss
TIER3_BONUS_BPS = 1500  // +15%   — Pizza Tycoon

// Tier toppings bonus (shown on weekly game page)
TIER0_TOPPING_BONUS = 0
TIER1_TOPPING_BONUS = 1
TIER2_TOPPING_BONUS = 3
TIER3_TOPPING_BONUS = 5

// Spin outcomes (out of 100 weight)
SPIN_REGULAR_WEIGHT = 73   // 73% — 1.0x   (SPIN_REGULAR_MULTIPLIER_BPS = 10000)
SPIN_LOADED_WEIGHT = 20    // 20% — 1.1x   (SPIN_LOADED_MULTIPLIER_BPS = 11000)
SPIN_HOT_WEIGHT = 5        // 5%  — 1.5x   (SPIN_HOT_MULTIPLIER_BPS = 15000)
SPIN_JACKPOT_WEIGHT = 2    // 2%  — 3.0x   (SPIN_JACKPOT_MULTIPLIER_BPS = 30000)
JACKPOT_FIXED_BONUS = 10_000_000 * 1e18    // +10M PIZZA on Jackpot (added after multiplier)
SPIN_TOTAL_WEIGHT = 100
```

**Verified on-chain:** `SPIN_JACKPOT_MULTIPLIER_BPS = 30000` → **3x** (NOT 4x).
**Verified on-chain:** `JACKPOT_FIXED_BONUS = 10,000,000 * 1e18` → 10M PIZZA bonus on Jackpot.

## Storage Layout (Append-Only — do not reorder)

| Declaration | Variable | Type | Notes |
|---|---|---|---|
| 0 | `pizzaToken` | `address` | PIZZA token |
| 1 | `stakingRewardsWallet` | `address` | Pays "extras" (bonuses, APY, jackpot) |
| 2 | `totalStaked` | `uint256` | Sum of all positions |
| 3 | `accRewardPerShare` | `uint256` | Legacy proportional accumulator |
| 4 | `boostEndTime` | `uint256` | Early staker +30% window |
| 5 | `spinEnabled` | `bool` | Global spin toggle |
| 6 | `bonusPool` | `uint256` | Legacy bonus pool |
| 7 | `spinNonce` | `uint256 private` | RNG counter |
| 8 | `flexibleStakes[addr]` | mapping → StakePosition | No-lock positions |
| 9 | `lockedStakes[addr]` | mapping → StakePosition | 7-day lock positions |
| 10 | `_legacyStakes[addr]` | mapping private | **DEPRECATED** — do not touch |
| 11 | `pizzaPartyContract` | `address` | PizzaPartyV2 proxy |
| 12 | `lastSpinGameId[addr]` | mapping | Last gameId the user spun |
| 13 | `pizzaPriceMicroUsd` | `uint256` | Oracle value |
| 14 | `stakerCount` | `uint256` | Unique stakers (for equal distribution) |
| 15 | `accRewardPerStaker` | `uint256` | Equal distribution accumulator |
| 16 | `stakerRewardDebt[addr]` | mapping | Per-user equal distribution debt |
| 17 | `lifetimeClaimed[addr]` | mapping | UI display total |
| 18 | `lastJackpotGameId` | `uint256` | Last day jackpot hit — locks further jackpots that day |
| 19 | `lastApyClaimTimestamp[addr]` | mapping | For linear APY accrual |
| 20 | `parlorManager` | `address` | For early unstake penalty routing |
| 21 | `fidVerificationRequired` | `bool` | Currently false |
| 22 | `fidToWallet[fid]` | mapping | FID binding (unused) |
| 23 | `walletToFid[addr]` | mapping | Reverse FID lookup |
| 24 | `committedSpinOutcome[addr]` | mapping → SpinOutcome | **Appended April 2026 (fix for storage corruption)** |
| 25 | `lockedApyBps` | `uint256` | APY override — 0 falls back to `LOCKED_APY_BPS` constant |
| 26 | `maxSpinsPerDay` | `uint8` | Normal=1, Game 100 had =2 |
| 27 | `spinCountToday[addr]` | mapping | Used when `maxSpinsPerDay > 1` |
| 28 | `committedSpinOutcome2[addr]` | mapping → SpinOutcome | Second spin outcome |
| 29 | `game100GoldAwardedGameId` | `uint256` | Hidden gold throttle |
| 30 | `goldChancePct` | `uint8` | Hidden gold chance (0 = off) |

## Critical Functions

### Staking / Unstaking (user-signed, no backend signer)

| Function | Purpose |
|---|---|
| `stake(amount, lockType)` | Create or add to flexible (0) or locked (1) position |
| `unstake(amount, lockType)` | Withdraw — locked position before lock-end charges 15% penalty to parlor manager |
| `claim()` | Claim from BOTH positions. Requires spin recorded for today. |
| `claimFromPosition(lockType)` | Claim from specific position only |
| `claimAfterSpin()` | Calls `_claimAllRewards(user, true)` — uses `committedSpinOutcome[user]` |
| `restake(lockType)` | Auto-compound. Applies spin outcome + jackpot bonus. Base restaked from contract balance; extras pulled from `stakingRewardsWallet` and restaked. Overflow beyond MAX_STAKE sent to wallet. |

### Spin the Pie

| Function | Purpose |
|---|---|
| `recordSpin()` | Commits on-chain spin outcome. Requires `tx.origin == msg.sender` EOA check. Sets `lastSpinGameId[user]` and `committedSpinOutcome[user]`. Emits `SpinRecorded(user, gameId, outcome)`. |
| `canSpinToday(user)` | View — is this user eligible to spin today? |

**PRNG:** `keccak256(abi.encodePacked(timestamp, prevrandao, sender, spinNonce))` — not VRF-grade but sufficient for 100-weight roll. Jackpot is downgraded to HotOutTheOven if already hit that day.

### Integration (called by PizzaPartyV2)

| Function | Caller | Purpose |
|---|---|---|
| `notifyRewardAmount(amount)` | `pizzaPartyContract` | Advances `accRewardPerStaker += amount * 1e18 / stakerCount`. If stakerCount=0, goes to `bonusPool`. |

### Views

- `getStakeInfo(user)` → `(total, flexible, locked, tier, lockEnd, pending, earlyBoostActive)`
- `getPositionInfo(user, lockType)` → per-position details
- `getPendingRewards(user)` → base + bonuses + APY at 1x assumption
- `getPendingRewardsForPosition(user, lockType)` → split by position weight
- `getPendingApyReward(user)` → APY component only
- `getTier(user)` → `Tier` enum (0-3) based on total staked
- `getTierLevel(user)` / `getTierYieldBoost(user)` / `getToppingBonus(user)` → for PizzaParty integration
- `getMinStake()` → $1 in PIZZA at current oracle price

### Admin Setters

- `adminSetPizzaToken(addr)` / `adminSetStakingRewardsWallet(addr)` / `adminSetPizzaPartyContract(addr)` / `adminSetParlorManager(addr)`
- `adminSetBoostEndTime(ts)` — early staker boost window
- `adminSetSpinEnabled(bool)` — global spin toggle
- `adminSetPizzaPrice(microUsd)` — price oracle update (cron calls this)
- `adminSetFidVerificationRequired(bool)` / `adminRegisterFidWallet(fid, addr)` / `adminBatchRegisterFidWallets(...)` / `adminRemoveFidWallet(fid)`
- `adminPause()` / `adminUnpause()` — emergency freeze
- `adminEmergencyRefund(token, stakers[])` / `adminForceUnstakeTo(stakers[], recipient)` — compromised wallet recovery
- `adminClearLifetimeClaimed(users[])`
- `adminSetLockedApyBps(bps)` / `adminSetMaxSpinsPerDay(n)` / `adminSetGoldChancePct(pct)`
- `adminInitializeStakerCount(n, stakers[])` / `adminAddMissingStakers(stakers[])` — data repair

## Reward Calculation Flow (all claim paths)

Inside `_claimAllRewards(user, applySpin)`:

```
1. baseReward = accRewardPerStaker - stakerRewardDebt[user]  (equal split of pot portion)
2. apyReward = locked.stakedAmount * lockedApyBps * secondsSinceLastClaim / (365 days * 10000)
3. If applySpin:
     require(lastSpinGameId[user] == currentGameId)
     outcome = committedSpinOutcome[user]
     multiplierBPS = _getSpinMultiplier(outcome)   // 10000, 11000, 15000, or 30000
     spunReward = baseReward * multiplierBPS / 10000
     if outcome == Jackpot: spunReward += JACKPOT_FIXED_BONUS (10M)
   Else:
     spunReward = baseReward
4. bonusAmount = spunReward * (tierBonus + lockBonus + earlyBonus) / 10000
5. finalReward = spunReward + bonusAmount + apyReward

Funding split:
  baseReward   → paid from CONTRACT BALANCE (funded by PizzaParty via notifyRewardAmount)
  extras (rest) → pulled from stakingRewardsWallet via safeTransferFrom
```

**Example** (100 PIZZA base, Jackpot, Tier1, Lock, Early):
- Spin: 100 × 3.0 = 300, + 10,000,000 = 10,000,300
- Bonuses: 10,000,300 × 38% = 3,800,114
- Final: 13,800,414 PIZZA

## Invariants

- `stakerCount` = users with (`flexibleStakes[u].stakedAmount + lockedStakes[u].stakedAmount > 0`)
- `accRewardPerStaker` monotonically increases
- Spin-applied claim paths require `lastSpinGameId[user] == currentGameId`
- `committedSpinOutcome[user]` holds outcome from last `recordSpin` — used for all claim paths
- `lastJackpotGameId == currentGameId` ⇒ next jackpot spin this game day downgraded
- Total user stake (flexible + locked) ≤ `MAX_STAKE` (20B)

## Integration Points

- **← PizzaPartyV2:** calls `notifyRewardAmount(amount)` on settlement
- **→ ParlorManager:** early unstake penalties routed there (if set)
- **→ stakingRewardsWallet:** extras pulled via `safeTransferFrom` — MUST have approval

## Position Model

- **flexibleStakes[user]:** no lock, no APY, no +5% lock bonus, no early unstake penalty
- **lockedStakes[user]:** 7-day lock, 25% APY on locked amount, +5% spin bonus, 15% early unstake penalty
- Both share a single `lastSpinGameId` and `committedSpinOutcome`
- Tier = TOTAL staked (flex + locked)

## Spin State Machine (actual flow)

1. Player clicks SPIN THE PIE
2. Frontend calls `recordSpin()` with user's EOA wallet
3. Contract: `_spin()` → commits outcome, sets `lastSpinGameId`, emits `SpinRecorded`
4. Frontend waits for receipt, **parses `SpinRecorded` event from receipt** (NOT contract state — RPC staleness bug)
5. UI animates wheel to revealed outcome
6. Player taps WALLET (`claimAfterSpin`) OR STAKE (`restake(lockType)`)
7. Contract applies committed outcome + bonuses + APY
8. Base paid from contract balance; extras from `stakingRewardsWallet`

## Known History

- **Storage corruption (Apr 2, 2026):** `committedSpinOutcome` was inserted mid-layout, shifted every slot, zeroed all positions. Fixed by appending at END. See `docs/SECURITY.md`.
- **Jackpot payout bug (Apr 7, 2026):** `claimAfterSpin` passed `applySpin=false`, skipping the spin block. `restake` used wrong helper. Both ignored committed outcome. Fixed; users compensated manually (~10.7M and ~10M PIZZA). See `docs/SECURITY.md`.
- **Stale RPC outcome bug (Apr 2026):** frontend read `committedSpinOutcome` via `eth_call` — RPC nodes served stale state showing yesterday's Jackpot. Fixed by parsing event logs from receipt.
- **MAX_STAKE raised 10B → 20B (Apr 2026):** implementation `0xe26142D4f6c87FD7d3925A85F08028FFd339F1B1`.
- **`recordSpin` EOA check added (Apr 2026):** `tx.origin == msg.sender` required.

## Files

- `foundry/src/PizzaStakingV1Upgradeable.sol` (1979 lines)
- Frontend: `app/components/StakingPage.tsx`
- ABI: `app/lib/constants/index.tsx`
- Leaderboard API: `app/api/staking/top-stakers/route.ts`
- Sync APIs: `app/api/staking/sync-stakers/route.ts`, `app/api/staking/update-staker/route.ts`
