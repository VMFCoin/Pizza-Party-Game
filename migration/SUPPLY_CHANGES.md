# Supply Change: 10 Million → 100 Billion

## Overview
The new $PIZZA token has **100 billion** total supply vs the current **10 million**.

**Multiplier needed: 10,000x** (but we use 1,000x because price will be ~10x lower)

Wait - let me clarify the math:
- Old supply: 10,000,000 (10M)
- New supply: 100,000,000,000 (100B)
- Ratio: 100B / 10M = **10,000x more tokens**

If the market cap stays similar, the price per token will be ~10,000x lower.
So tier thresholds should be **multiplied by 10,000** to maintain the same USD value.

**However**, looking at the code comments, they say "multiply by 1000 for 10B supply" - this suggests the original design was for 100M supply (not 10M), and 10B was the target. Let me check the actual math:

- If comments say "multiply by 1000 for 10B" and current is "10M testing"
- 10M × 1000 = 10B (not 100B)

**For 100B supply, multiply by 10,000.**

---

## Values That MUST Change

### 1. Smart Contract: PizzaStakingV1Upgradeable.sol

| Line | Constant | Current (10M) | New (100B) | Multiplier |
|------|----------|---------------|------------|------------|
| 93 | `MIN_STAKE_FALLBACK` | `100 * 1e18` | `1_000_000 * 1e18` | 10,000x |
| 97 | `MAX_STAKE` | `1_000_000 * 1e18` | `10_000_000_000 * 1e18` | 10,000x |
| 123 | `TIER1_THRESHOLD` | `50_000 * 1e18` | `500_000_000 * 1e18` | 10,000x |
| 126 | `TIER2_THRESHOLD` | `200_000 * 1e18` | `2_000_000_000 * 1e18` | 10,000x |
| 129 | `TIER3_THRESHOLD` | `500_000 * 1e18` | `5_000_000_000 * 1e18` | 10,000x |

**Percentage of Supply Reference:**
| Tier | Current | % of 10M | New | % of 100B |
|------|---------|----------|-----|-----------|
| Min Stake | 100 | 0.001% | 1,000,000 | 0.001% |
| Max Stake | 1M | 10% | 10B | 10% |
| Tier 1 | 50K | 0.5% | 500M | 0.5% |
| Tier 2 | 200K | 2% | 2B | 2% |
| Tier 3 | 500K | 5% | 5B | 5% |

### 2. Frontend: StakingPage.tsx

| Line | Field | Current (10M) | New (100B) |
|------|-------|---------------|------------|
| 36 | `STAKING_TIERS[1].minStake` | `50_000` | `500_000_000` |
| 37 | `STAKING_TIERS[2].minStake` | `200_000` | `2_000_000_000` |
| 38 | `STAKING_TIERS[3].minStake` | `500_000` | `5_000_000_000` |
| 47 | `MIN_STAKE_FALLBACK` | `100` | `1_000_000` |
| 48 | `_MAX_STAKE` | `1_000_000` | `10_000_000_000` |

---

## Values That DO NOT Change

These are already supply-agnostic (percentages, BPS, or dynamic):

### Percentages (BPS - Basis Points)
- All yield bonuses (150, 300, 700, 1500 BPS)
- Lock bonus (500 BPS = 5%)
- Early boost (3000 BPS = 30%)
- Locked APY (2000 BPS = 20%)
- Early unstake penalty (1500 BPS = 15%)
- Spin multipliers (10000, 11000, 15000, 40000 BPS)

### Dynamic Pricing (USD-based)
- `MIN_ENTRY_FEE` (0.01 PIZZA) - dynamic pricing adjusts
- `MAX_ENTRY_FEE` (1000 PIZZA) - dynamic pricing adjusts
- `holdingsUnitPizza` - calculated from USD price
- `toppingUnitPizza` - calculated from USD price
- Parlor price bounds (500-500K PIZZA) - safety rails only

### Counts (not token amounts)
- Topping bonuses (0, 1, 3, 5 toppings)
- Max parlors, slices, winners, etc.
- Spin weights (73, 20, 5, 2)

---

## Decision Point: What Multiplier to Use?

The code comments mention "multiply by 1000 for 10B supply" but you said **100B**.

**Option A: Maintain Same Percentage of Supply**
- Multiply by 10,000
- Tier 1 at 500M PIZZA (0.5% of 100B)
- Same "skin in the game" relative to supply

**Option B: Maintain Same Token Count (Lower Bar)**
- Multiply by 1,000
- Tier 1 at 50M PIZZA (0.05% of 100B)
- Easier for users to reach tiers

**Option C: Maintain Same USD Value (Price Dependent)**
- If new token price is 10,000x lower, multiply by 10,000
- If new token price is 1,000x lower, multiply by 1,000
- Depends on initial market cap and liquidity

**Recommendation:** Use Option A (10,000x) to maintain the same percentage thresholds. This keeps the game economics consistent with the original design.

---

## Implementation Notes

### Smart Contract Changes (Requires Upgrade)
The staking contract is upgradeable (UUPS), but these are **constants**, not storage variables.

**To change constants, you must:**
1. Deploy a new implementation with updated constants
2. Upgrade the proxy to point to new implementation
3. OR add admin functions to set these values dynamically

### Frontend Changes
Simple code changes in `StakingPage.tsx`.

---

## Files to Modify

1. `foundry/src/PizzaStakingV1Upgradeable.sol` - Lines 93, 97, 123, 126, 129
2. `app/components/StakingPage.tsx` - Lines 36-38, 47-48

---

## Questions to Answer Before Migrating

1. **Confirm 100B supply** - Is it exactly 100,000,000,000 tokens with 18 decimals?
2. **Multiplier choice** - 10,000x (same % of supply) or different?
3. **Price expectations** - What's the expected launch price?
4. **Existing stakers** - Will current stakes carry over or need to unstake first?
