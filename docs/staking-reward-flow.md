# Daily Settlement → Staking Rewards Workflow

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DAILY GAME SETTLEMENT                                │
│                    (PizzaPartyV2._settleDailyGame)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CALCULATE POT SPLIT                                 │
│                                                                              │
│   Total Pot: 100%                                                            │
│   ├── Winners: 93% (PLAYERS_POOL_BPS = 9300)                                │
│   ├── Staking: 1%  (stakingFeeBPS = 100)                                    │
│   ├── Parlor Owners: 4% (parlorFeeBPS = 400)                                │
│   └── Owner/Treasury: 2% (ownerFeeBPS = 200)                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────────┐
            │  Winners  │   │  Parlor   │   │  Staking      │
            │   (93%)   │   │  Owners   │   │  Contract     │
            │           │   │   (4%)    │   │    (1%)       │
            └───────────┘   └───────────┘   └───────┬───────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STAKING CONTRACT RECEIVES 1%                              │
│                 (PizzaStakingV1.notifyRewardAmount)                         │
│                                                                              │
│   Called by PizzaPartyV2 during _settleDailyGame:                           │
│   stakingContract.notifyRewardAmount(stakingFee)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EQUAL REWARD DISTRIBUTION                               │
│                                                                              │
│   if (stakerCount == 0):                                                    │
│       → Add to bonusPool (no stakers to pay)                                │
│   else:                                                                      │
│       accRewardPerStaker += (amount × 1e18) ÷ stakerCount                   │
│                                                                              │
│   Example with 3 stakers and 100 PIZZA:                                     │
│   accRewardPerStaker += (100 × 1e18) ÷ 3 = ~33.33 PIZZA per staker         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REWARDS ACCUMULATE PER STAKER                             │
│                                                                              │
│   Each staker's pending reward = accRewardPerStaker - stakerRewardDebt      │
│   Rewards ACCUMULATE if not claimed (no "use it or lose it")                │
│                                                                              │
│   Day 1: Pot = 10,000 PIZZA → Staking = 100 → Each staker: 33.33 PIZZA     │
│   Day 2: Pot = 15,000 PIZZA → Staking = 150 → Each staker: +50 PIZZA       │
│   Day 3: Pot = 12,000 PIZZA → Staking = 120 → Each staker: +40 PIZZA       │
│   ────────────────────────────────────────────────────────────────────      │
│   If didn't claim Days 1-3, each staker has: 123.33 PIZZA pending          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAKER CLAIMS REWARDS                                 │
│                     (PizzaStakingV1.claim)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CALCULATE TOTAL PENDING REWARDS                           │
│                (_calculateTotalPendingRewards)                              │
│                                                                              │
│   baseReward = (accRewardPerStaker - stakerRewardDebt[user]) ÷ 1e18        │
│                                                                              │
│   Apply Bonuses (ADDITIVE, not multiplicative):                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ totalBonusBPS = 10000 (base = 100%)                                 │   │
│   │ + tierBonus   (Slice Runner: +1.5%, Oven: +5%, Boss: +10%, Tyc: +20%)│  │
│   │ + lockBonus   (+10% if has locked position)                         │   │
│   │ + earlyBonus  (+30% during first 60 days)                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   finalReward = (baseReward × totalBonusBPS) ÷ 10000                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SPIN THE PIE (Optional)                              │
│                    (if spinEnabled = true)                                  │
│                                                                              │
│   One spin per game day per staker (tracked by lastSpinGameId)              │
│                                                                              │
│   Spin Outcomes:                                                             │
│   ├── Regular Slice (73%): 100% payout                                      │
│   ├── Loaded Slice (20%): 110% payout                                       │
│   ├── Hot Out the Oven (5%): 125% payout                                    │
│   └── Jackpot (2%): 200% payout                                             │
│                                                                              │
│   Payouts above 100% come from bonusPool                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSFER REWARDS TO USER                              │
│                                                                              │
│   IERC20(pizzaToken).safeTransfer(user, finalReward)                        │
│   stakerRewardDebt[user] = accRewardPerStaker  (reset for next claim)       │
│                                                                              │
│   emit RewardsClaimed(user, baseReward, finalReward, spinOutcome)           │
└─────────────────────────────────────────────────────────────────────────────┘


## Example Calculation

### Scenario
- Daily pot: 10,000 PIZZA
- 3 stakers with varying amounts (doesn't matter - equal distribution!)
- All stakers have early boost active (+30%)
- Staker A: Slice Runner tier (+1.5%), no lock
- Staker B: Oven Operator tier (+5%), has lock (+10%)
- Staker C: Pizza Tycoon tier (+20%), has lock (+10%)

### Step 1: Distribution from Pot
```
Staking fee = 10,000 PIZZA × 1% = 100 PIZZA
Per staker base = 100 PIZZA ÷ 3 = 33.33 PIZZA
```

### Step 2: Apply Bonuses

**Staker A (Slice Runner, no lock):**
```
Base:        100%  (10000 BPS)
+ Tier:      +1.5% (150 BPS)
+ Lock:      +0%   (0 BPS)
+ Early:     +30%  (3000 BPS)
───────────────────────────────
Total:       131.5% (13150 BPS)

Reward = 33.33 × 131.5% = 43.83 PIZZA
```

**Staker B (Oven Operator, locked):**
```
Base:        100%  (10000 BPS)
+ Tier:      +5%   (500 BPS)
+ Lock:      +10%  (1000 BPS)
+ Early:     +30%  (3000 BPS)
───────────────────────────────
Total:       145% (14500 BPS)

Reward = 33.33 × 145% = 48.33 PIZZA
```

**Staker C (Pizza Tycoon, locked):**
```
Base:        100%  (10000 BPS)
+ Tier:      +20%  (2000 BPS)
+ Lock:      +10%  (1000 BPS)
+ Early:     +30%  (3000 BPS)
───────────────────────────────
Total:       160% (16000 BPS)

Reward = 33.33 × 160% = 53.33 PIZZA
```

### Step 3: Spin (if enabled)
If Staker C spins and hits Jackpot (2% chance):
```
Spin multiplier = 200%
Final reward = 53.33 × 200% = 106.66 PIZZA
(Extra 53.33 PIZZA comes from bonusPool)
```


## Key Points

1. **Equal Base Distribution**: All stakers get the same base reward from the daily pot, regardless of stake size.

2. **Bonuses Are Additive**: Tier, lock, and early bonuses ADD to 100%, not multiply. A +10% tier + +30% early = 140% total, not 143%.

3. **Rewards Accumulate**: If a staker doesn't claim, rewards pile up. There's no "daily reset" that loses unclaimed rewards.

4. **One Spin Per Day**: Each staker can spin once per game day. Spin is tracked by `lastSpinGameId` matching the current daily game.

5. **Staker Count Matters**: The equal distribution divides by `stakerCount`. More stakers = smaller individual share.

6. **Auto-Tracking**: New stakers are automatically added to `stakerCount` when they stake. `stakerCount` decrements when someone fully unstakes.
