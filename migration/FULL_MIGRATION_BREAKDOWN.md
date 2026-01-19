# Complete Token Migration Breakdown

## Overview of Changes

This document details EVERYTHING that needs to change for the 100B $PIZZA token migration.

---

# DAILY GAME PAGE

## Entry Fee Calculation

**Current Logic:** [useGamePageData.tsx:252-286](app/lib/useGamePageData.tsx#L252-L286)
```typescript
const pizzaPerDollar = 1 / pizzaUsdPrice
const amountWei = BigInt(Math.floor(pizzaPerDollar * 1e18))
// Clamped to MIN_ENTRY_FEE (0.01 PIZZA) and MAX_ENTRY_FEE (1000 PIZZA)
```

**Display:** Shows `xxx.xxx PIZZA` for $1 entry - YES this works correctly

### CHANGE NEEDED: Remove Entry Fee Bounds

**Current:** [PizzaPartyV2Upgradeable.sol:20-21](foundry/src/PizzaPartyV2Upgradeable.sol#L20-L21)
```solidity
uint256 public constant MIN_ENTRY_FEE = 1e16;      // 0.01 PIZZA
uint256 public constant MAX_ENTRY_FEE = 1000e18;   // 1000 PIZZA
```

**NEW:** Remove bounds (or set to extreme values)
```solidity
uint256 public constant MIN_ENTRY_FEE = 1;                    // 1 wei (effectively no minimum)
uint256 public constant MAX_ENTRY_FEE = type(uint256).max;    // No maximum
```

## Fee Distribution

**Current:** [PizzaPartyV2Upgradeable.sol:25-28](foundry/src/PizzaPartyV2Upgradeable.sol#L25-L28)
```solidity
CHARITY_TOTAL_BPS = 300;    // 3%
PLAYERS_POOL_BPS = 9300;    // 93%
MAX_OWNER_FEE_BPS = 300;    // 3%
STAKING_POOL_BPS = 100;     // 1%
```

### CHANGE NEEDED: New Distribution

**NEW:**
```solidity
CHARITY_TOTAL_BPS = 300;    // 3%
PLAYERS_POOL_BPS = 8000;    // 80% (split among 8 winners = 10% each)
MAX_OWNER_FEE_BPS = 700;    // 7%
STAKING_POOL_BPS = 1000;    // 10%
// Total = 100%
```

---

# WEEKLY GAME PAGE

## Current Implementation

**Jackpot Calculation:** [PizzaPartyV2Upgradeable.sol:720-723](foundry/src/PizzaPartyV2Upgradeable.sol#L720-L723)
```solidity
uint256 jackpot = week.totalClaimedToppings * toppingUnitPizza + weeklyTreasuryBonus;
```

**Topping Value:** 1 topping = $0.10 USD worth of PIZZA (dynamic)

### NO CHANGES NEEDED
- Topping values are USD-based, auto-adjust
- Distribution logic stays same

---

# LEADERBOARD PAGE

## Historical Stats Conversion

**Problem:** Old stats are in old token wei. With 100B supply, we need to show equivalent values.

**Current Storage:** [PizzaPartyV2Upgradeable.sol](foundry/src/PizzaPartyV2Upgradeable.sol)
```solidity
struct PlayerLifetimeStats {
    uint256 totalDailyWins;
    uint256 totalWeeklyWins;
    uint256 totalPizzaWon;      // stored in wei
    uint256 lifetimeToppings;
    uint256 lifetimeReferrals;
}
```

### CHANGE NEEDED: Conversion Multiplier

**Option A: Frontend Conversion**
Add to [LeaderboardPage.tsx](app/components/LeaderboardPage.tsx):
```typescript
const SUPPLY_MULTIPLIER = 10000n; // 100B / 10M = 10,000x
const adjustedPizzaWon = stats.totalPizzaWon * SUPPLY_MULTIPLIER;
```

**Option B: Smart Contract Migration Function**
Add to contract:
```solidity
function migratePlayerStats(address player) external onlyOwner {
    playerLifetimeStats[player].totalPizzaWon *= 10000;
}
```

**Recommendation:** Option A (frontend) - doesn't require contract changes, can be toggled on migration day.

---

# LIFETIME STATS PAGE

Same as Leaderboard - apply the 10,000x multiplier to `totalPizzaWon` for display.

---

# PARLOR PAGE

## Purchase Price

**Current:** [PizzaParlorManagerUpgradeable.sol:56-57](foundry/src/PizzaParlorManagerUpgradeable.sol#L56-L57)
```solidity
uint256 public constant MIN_PARLOR_PRICE = 500e18;      // 500 PIZZA
uint256 public constant MAX_PARLOR_PRICE = 500_000e18;  // 500,000 PIZZA
```

### CHANGE NEEDED: Remove Price Bounds

**NEW:**
```solidity
uint256 public constant MIN_PARLOR_PRICE = 1;                   // 1 wei (no minimum)
uint256 public constant MAX_PARLOR_PRICE = type(uint256).max;   // No maximum
```

## Burn & Distribution - NO CHANGES
- 50% burned
- 30% treasury
- 20% ops

---

# STAKING PAGE

## Tier Thresholds

**Current:** [PizzaStakingV1Upgradeable.sol:123-129](foundry/src/PizzaStakingV1Upgradeable.sol#L123-L129)

| Tier | Current | New (100B) |
|------|---------|------------|
| Slice Runner | 0 | 0 |
| Oven Operator | 50,000 | 500,000,000 |
| Pie Boss | 200,000 | 2,000,000,000 |
| Pizza Tycoon | 500,000 | 5,000,000,000 |

### CHANGE NEEDED:
```solidity
uint256 public constant TIER1_THRESHOLD = 500_000_000 * 1e18;   // 500M
uint256 public constant TIER2_THRESHOLD = 2_000_000_000 * 1e18; // 2B
uint256 public constant TIER3_THRESHOLD = 5_000_000_000 * 1e18; // 5B
```

## Staking Limits

**Current:**
```solidity
MIN_STAKE_FALLBACK = 100 * 1e18;        // 100 PIZZA
MAX_STAKE = 1_000_000 * 1e18;           // 1M PIZZA
```

### CHANGE NEEDED: Remove All Bounds

With 100B supply, if price is $0.0000001, then $1 = 10,000,000,000 PIZZA (10B!)
We can't predict the price, so we need to:
1. Remove hardcoded bounds entirely
2. Use smarter fallback logic

**NEW:**
```solidity
// Remove MIN_STAKE_FALLBACK constant entirely - use dynamic logic only
// Remove MAX_STAKE constant - or set to total supply
MAX_STAKE = 100_000_000_000 * 1e18;     // 100B = total supply (no artificial cap)
```

## New Min Stake Fallback Logic

**Your Request:** Check multiple DEXs + look at last entry amount

**NEW LOGIC - Multi-source price with last entry fallback:**

```typescript
// In useGamePageData.tsx or new utility
async function getMinStakeAmount(): Promise<bigint> {
  const tokenAddress = PIZZA_TOKEN_ADDRESS;

  // 1. Try DexScreener
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const dexData = await dexRes.json();
    if (dexData.pairs?.[0]?.priceUsd) {
      const price = parseFloat(dexData.pairs[0].priceUsd);
      return BigInt(Math.ceil(1 / price * 1e18)); // $1 worth
    }
  } catch {}

  // 2. Try GeckoTerminal
  try {
    const geckoRes = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${tokenAddress}`);
    const geckoData = await geckoRes.json();
    const price = parseFloat(geckoData.data?.attributes?.token_prices?.[tokenAddress.toLowerCase()]);
    if (price > 0) {
      return BigInt(Math.ceil(1 / price * 1e18)); // $1 worth
    }
  } catch {}

  // 3. Fallback: Get last entry amount from contract
  try {
    const lastEntry = await contract.read.getLastEntryAmount();
    if (lastEntry > 0n) return lastEntry;
  } catch {}

  // 4. Ultimate fallback - should never reach here
  return 1000n * 10n**18n; // 1000 PIZZA as absolute last resort
}
```

**Contract Addition Needed:**
```solidity
// In PizzaPartyV2Upgradeable.sol
uint256 public lastEntryAmount;

function enterDailyGame(uint256 amountPaid, string calldata referralCode) external {
    // ... existing logic ...
    lastEntryAmount = amountPaid; // Store for fallback reference
}

function getLastEntryAmount() external view returns (uint256) {
    return lastEntryAmount;
}
```

## Jackpot Spin Bonus

### CHANGE NEEDED: Add 10B PIZZA Jackpot Reward

**Your Request:** Add 10,000,000,000 PIZZA for landing on gold jackpot slice

**Current:** [PizzaStakingV1Upgradeable.sol:177-181](foundry/src/PizzaStakingV1Upgradeable.sol#L177-L181)
```solidity
uint256 public constant SPIN_JACKPOT_WEIGHT = 2;        // 2% probability
uint256 public constant SPIN_JACKPOT_MULTIPLIER_BPS = 40000; // 4x (400%)
```

**NEW:** Add fixed PIZZA bonus on jackpot:
```solidity
uint256 public constant JACKPOT_FIXED_BONUS = 10_000_000_000 * 1e18; // 10B PIZZA

// In spin function:
if (outcome == SpinOutcome.Jackpot) {
    reward = (baseReward * SPIN_JACKPOT_MULTIPLIER_BPS) / BPS_DENOMINATOR;
    reward += JACKPOT_FIXED_BONUS; // Add fixed 10B bonus
}
```

## Early Unstake Penalty Redirection

### CHANGE NEEDED: Penalty to Parlor Owners

**Current:** [PizzaStakingV1Upgradeable.sol:509](foundry/src/PizzaStakingV1Upgradeable.sol#L509)
```solidity
bonusPool += penalty; // Goes to bonus pool
```

**NEW:** Send to parlor owners instead
```solidity
// Option 1: Direct transfer to PizzaParlorManager
IPizzaParlorManager(parlorManager).distributePenalty(penalty);

// Option 2: Accumulate and let owners claim
parlorOwnerPenaltyPool += penalty;
// Then split evenly when claimed
```

**Contract Change Required:**
```solidity
// In PizzaStakingV1Upgradeable.sol
address public parlorManager;

function adminSetParlorManager(address _parlorManager) external onlyOwner {
    parlorManager = _parlorManager;
}

// In unstake():
if (penalty > 0) {
    // Transfer penalty to parlor manager for distribution
    pizzaToken.safeTransfer(parlorManager, penalty);
    IPizzaParlorManager(parlorManager).receivePenaltyForOwners(penalty);
}
```

**In PizzaParlorManagerUpgradeable.sol:**
```solidity
uint256 public pendingOwnerPenalties;

function receivePenaltyForOwners(uint256 amount) external {
    require(msg.sender == stakingContract, "Only staking");
    pendingOwnerPenalties += amount;
}

function claimOwnerFees() external {
    // ... existing logic ...

    // Add penalty share
    uint256 penaltyShare = pendingOwnerPenalties / totalParlors;
    uint256 myParlors = getParlorCount(msg.sender);
    uint256 myPenaltyShare = penaltyShare * myParlors;

    pendingOwnerPenalties -= myPenaltyShare;
    totalOwed += myPenaltyShare;
}
```

---

# SUMMARY: All Changes Required

## Smart Contract Changes

### PizzaPartyV2Upgradeable.sol
| Line | Change | Current | New |
|------|--------|---------|-----|
| 20 | MIN_ENTRY_FEE | `1e16` | `1` (no minimum) |
| 21 | MAX_ENTRY_FEE | `1000e18` | `type(uint256).max` (no maximum) |
| 25 | CHARITY_TOTAL_BPS | `300` | `300` (no change - 3%) |
| 26 | PLAYERS_POOL_BPS | `9300` | `8000` (80%) |
| 27 | MAX_OWNER_FEE_BPS | `300` | `700` (7%) |
| 28 | STAKING_POOL_BPS | `100` | `1000` (10%) |
| NEW | lastEntryAmount | N/A | Store last entry for fallback |
| NEW | getLastEntryAmount() | N/A | View function for fallback |

### PizzaStakingV1Upgradeable.sol
| Line | Change | Current | New |
|------|--------|---------|-----|
| 93 | MIN_STAKE_FALLBACK | `100 * 1e18` | **REMOVE** - use dynamic logic |
| 97 | MAX_STAKE | `1_000_000 * 1e18` | `100_000_000_000 * 1e18` (100B - no cap) |
| 123 | TIER1_THRESHOLD | `50_000 * 1e18` | `500_000_000 * 1e18` |
| 126 | TIER2_THRESHOLD | `200_000 * 1e18` | `2_000_000_000 * 1e18` |
| 129 | TIER3_THRESHOLD | `500_000 * 1e18` | `5_000_000_000 * 1e18` |
| NEW | JACKPOT_FIXED_BONUS | N/A | `10_000_000_000 * 1e18` (10B) |
| 509 | Penalty destination | `bonusPool` | `parlorManager` (to owners) |

### PizzaParlorManagerUpgradeable.sol
| Line | Change | Current | New |
|------|--------|---------|-----|
| 56 | MIN_PARLOR_PRICE | `500e18` | `1` (no minimum) |
| 57 | MAX_PARLOR_PRICE | `500_000e18` | `type(uint256).max` (no maximum) |
| NEW | receivePenaltyForOwners() | N/A | Receive 15% penalties from staking |
| NEW | pendingOwnerPenalties | N/A | Storage for penalty pool |

## Frontend Changes

### StakingPage.tsx
| Line | Change | Current | New |
|------|--------|---------|-----|
| 36 | Tier 1 minStake | `50_000` | `500_000_000` |
| 37 | Tier 2 minStake | `200_000` | `2_000_000_000` |
| 38 | Tier 3 minStake | `500_000` | `5_000_000_000` |
| 47 | MIN_STAKE_FALLBACK | `100` | **REMOVE** - use getMinStakeAmount() |
| 48 | _MAX_STAKE | `1_000_000` | `100_000_000_000` (or remove) |
| NEW | Jackpot spin display | N/A | Show "+10B PIZZA BONUS!" on jackpot |

### LeaderboardPage.tsx
| Change | Description |
|--------|-------------|
| NEW | Add SUPPLY_MULTIPLIER = 10000n |
| NEW | Multiply totalPizzaWon by multiplier for historical display |

### useGamePageData.tsx / New utility
| Change | Description |
|--------|-------------|
| NEW | getMinStakeAmount() - multi-DEX price check |
| NEW | Fallback to last entry amount from contract |
| NEW | Remove hardcoded MIN/MAX bounds from UI validation |

## Display Changes (All Modals & Pages)

The `formatPizza()` and `formatPizzaWei()` functions already handle large numbers:
```typescript
if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`
if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
```

This means displays will correctly show:
- 10,000,000,000 PIZZA → "10.00B PIZZA"
- 500,000,000 PIZZA → "500.00M PIZZA"
- Entry fees in billions → "X.XXB PIZZA to play"

---

# Files to Create/Modify

## New Migration Scripts Needed

1. **Update supply-migration.sh** - Add new changes
2. **Create fee-distribution-migration.sh** - For the 80/7/10/3 split
3. **Create penalty-redirect-migration.sh** - For early unstake → parlor owners

## Contract Upgrades Required

1. **PizzaPartyV2** - New implementation with updated constants
2. **PizzaStakingV1** - New implementation with:
   - Updated thresholds
   - Jackpot bonus
   - Penalty redirect to parlors
3. **PizzaParlorManager** - New implementation with:
   - Removed price bounds
   - Penalty receiving function

---

# Pre-Launch Checklist

- [ ] New token address confirmed
- [ ] Burn function verified on new token
- [ ] Price feeds working for new token
- [ ] Treasury funded with new tokens
- [ ] Staking rewards wallet funded with new tokens
- [ ] All contract upgrades deployed
- [ ] Frontend updated and deployed
- [ ] Historical stats multiplier active
- [ ] Jackpot bonus pool funded (need PIZZA for 10B rewards)
