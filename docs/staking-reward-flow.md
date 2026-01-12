# Daily Settlement → Staking Rewards → Claim/Spin Complete Workflow

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PART 1: DAILY SETTLEMENT                            │
│                         (Happens at 12:00 PM PT each day)                        │
└─────────────────────────────────────────────────────────────────────────────────┘

                              DAILY GAME ENDS
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PizzaPartyV2._settleDailyGame()                               │
│                                                                                  │
│   Total Pot Example: 10,000 PIZZA                                               │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │  93% → Winners Pool (9,300 PIZZA)                                         │ │
│   │   4% → Parlor Owners (400 PIZZA)                                          │ │
│   │   2% → Treasury (200 PIZZA)                                               │ │
│   │   1% → STAKING CONTRACT (100 PIZZA) ◄─── This goes to stakers!           │ │
│   └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ stakingContract.notifyRewardAmount(100 PIZZA)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STAKING CONTRACT RECEIVES 1%                                  │
│                 PizzaStakingV1.notifyRewardAmount()                              │
│                                                                                  │
│   if (stakerCount == 0):                                                        │
│       → Add to bonusPool (saved for later)                                      │
│   else:                                                                          │
│       accRewardPerStaker += (100 PIZZA × 1e18) ÷ stakerCount                    │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  EQUAL DISTRIBUTION EXAMPLE                                             │   │
│   │                                                                         │   │
│   │  100 PIZZA ÷ 3 stakers = 33.33 PIZZA each (base reward)                │   │
│   │                                                                         │   │
│   │  Staker A: 33.33 PIZZA (staked 100 PIZZA)                              │   │
│   │  Staker B: 33.33 PIZZA (staked 1,000 PIZZA)                            │   │
│   │  Staker C: 33.33 PIZZA (staked 500,000 PIZZA)                          │   │
│   │                                                                         │   │
│   │  ► ALL GET SAME BASE AMOUNT regardless of stake size!                  │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Rewards accumulate in accRewardPerStaker
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         REWARDS ACCUMULATE DAILY                                 │
│                                                                                  │
│   Day 1: Pot = 10,000 → Staking = 100 → Each staker: +33.33 PIZZA              │
│   Day 2: Pot = 15,000 → Staking = 150 → Each staker: +50.00 PIZZA              │
│   Day 3: Pot = 12,000 → Staking = 120 → Each staker: +40.00 PIZZA              │
│   Day 4: Pot = 8,000  → Staking = 80  → Each staker: +26.67 PIZZA              │
│   ───────────────────────────────────────────────────────────────────────────   │
│   TOTAL ACCUMULATED (if not claimed): 150 PIZZA per staker                      │
│                                                                                  │
│   ► Rewards DO NOT expire! Skip days = rewards pile up for later claim         │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PART 2: USER CLAIMS REWARDS                            │
│                          (User clicks SPIN & CLAIM button)                       │
└─────────────────────────────────────────────────────────────────────────────────┘

                         USER OPENS SPIN & CLAIM MODAL
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 1: CALCULATE BASE REWARD                                 │
│                 _calculateTotalPendingRewards(user)                             │
│                                                                                  │
│   baseReward = (accRewardPerStaker - stakerRewardDebt[user]) ÷ 1e18            │
│                                                                                  │
│   Example: User hasn't claimed in 4 days                                        │
│   baseReward = 150 PIZZA                                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 2: APPLY BONUS MULTIPLIERS                               │
│                      (Bonuses are ADDITIVE, not multiplicative)                  │
│                                                                                  │
│   Start with: 100% (10000 BPS)                                                  │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  + TIER BONUS (based on total staked amount)                            │   │
│   │                                                                         │   │
│   │    🍕 Slice Runner    (0 - 49,999 PIZZA):     +1.5%                     │   │
│   │    🔥 Oven Operator   (50,000 - 199,999):     +5%                       │   │
│   │    👨‍🍳 Pie Boss        (200,000 - 499,999):    +10%                      │   │
│   │    👑 Pizza Tycoon    (500,000+):             +20%                      │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  + LOCK BONUS (if user has ANY locked position)                         │   │
│   │                                                                         │   │
│   │    No Lock:   +0%                                                       │   │
│   │    7-Day Lock: +10%                                                     │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  + EARLY STAKER BONUS (first 60 days after staking launch)              │   │
│   │                                                                         │   │
│   │    Active:   +30%                                                       │   │
│   │    Expired:  +0%                                                        │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   FORMULA: finalReward = baseReward × (totalBonusBPS ÷ 10000)                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         BONUS CALCULATION EXAMPLE                                │
│                                                                                  │
│   User: Pizza Tycoon tier, has 7-day lock, early boost active                   │
│   Base Reward: 150 PIZZA                                                        │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Base:         100%   (10000 BPS)                                       │   │
│   │  + Tier:       +20%   (2000 BPS)   ← Pizza Tycoon                       │   │
│   │  + Lock:       +10%   (1000 BPS)   ← 7-day lock                         │   │
│   │  + Early:      +30%   (3000 BPS)   ← First 60 days                      │   │
│   │  ─────────────────────────────────────────────────────────              │   │
│   │  TOTAL:        160%   (16000 BPS)                                       │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   Pre-Spin Reward = 150 PIZZA × 160% = 240 PIZZA                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 3: SPIN THE PIE                                     │
│                    (If spinEnabled = true AND hasn't spun today)                 │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │                        🍕 SPIN THE PIE 🍕                               │   │
│   │                                                                         │   │
│   │    ┌────────────────────────────────────────────────────────────┐      │   │
│   │    │                                                            │      │   │
│   │    │     🟡 Regular Slice    73% chance    100% payout         │      │   │
│   │    │     🟠 Loaded Slice     20% chance    110% payout         │      │   │
│   │    │     🔴 Hot Out the Oven  5% chance    125% payout         │      │   │
│   │    │     🟢 JACKPOT           2% chance    200% payout         │      │   │
│   │    │                                                            │      │   │
│   │    └────────────────────────────────────────────────────────────┘      │   │
│   │                                                                         │   │
│   │    One spin per day per staker (tracked by lastSpinGameId)              │   │
│   │    Payouts above 100% funded from bonusPool                             │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SPIN OUTCOME EXAMPLES                                    │
│                                                                                  │
│   Pre-Spin Reward: 240 PIZZA                                                    │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  🟡 Regular Slice (73% chance)                                          │   │
│   │     240 × 100% = 240 PIZZA                                              │   │
│   │                                                                         │   │
│   │  🟠 Loaded Slice (20% chance)                                           │   │
│   │     240 × 110% = 264 PIZZA (+24 from bonusPool)                         │   │
│   │                                                                         │   │
│   │  🔴 Hot Out the Oven (5% chance)                                        │   │
│   │     240 × 125% = 300 PIZZA (+60 from bonusPool)                         │   │
│   │                                                                         │   │
│   │  🟢 JACKPOT (2% chance)                                                 │   │
│   │     240 × 200% = 480 PIZZA (+240 from bonusPool)                        │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 4: CHOOSE CLAIM OR RESTAKE                               │
│                                                                                  │
│   After spinning, user sees their final reward and chooses:                      │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   ┌─────────────────────┐    ┌─────────────────────┐                   │   │
│   │   │                     │    │                     │                   │   │
│   │   │   🔓 NO LOCK        │    │   🔒 7-DAY LOCK     │                   │   │
│   │   │                     │    │                     │                   │   │
│   │   │   Claim to wallet   │    │   Restake rewards   │                   │   │
│   │   │                     │    │   +10% lock bonus   │                   │   │
│   │   │   Tokens sent to    │    │   on FUTURE claims  │                   │   │
│   │   │   your wallet       │    │                     │                   │   │
│   │   │                     │    │   Compounds your    │                   │   │
│   │   │                     │    │   staking position  │                   │   │
│   │   │                     │    │                     │                   │   │
│   │   └─────────────────────┘    └─────────────────────┘                   │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│      USER CHOOSES "NO LOCK"       │   │    USER CHOOSES "7-DAY LOCK"      │
│                                   │   │                                   │
│   Contract calls: claim()         │   │   Contract calls: restake(1)      │
│                                   │   │                                   │
│   ┌─────────────────────────────┐ │   │   ┌─────────────────────────────┐ │
│   │                             │ │   │   │                             │ │
│   │  PIZZA tokens transferred   │ │   │   │  Rewards added to locked    │ │
│   │  to user's wallet           │ │   │   │  staking position           │ │
│   │                             │ │   │   │                             │ │
│   │  User can spend, sell,      │ │   │   │  Lock timer resets to       │ │
│   │  trade, or manually         │ │   │   │  7 days from now            │ │
│   │  restake later              │ │   │   │                             │ │
│   │                             │ │   │   │  Increases tier progress    │ │
│   │                             │ │   │   │  (if enough to level up)    │ │
│   │                             │ │   │   │                             │ │
│   │                             │ │   │   │  Gets +10% lock bonus on    │ │
│   │                             │ │   │   │  ALL future reward claims   │ │
│   │                             │ │   │   │                             │ │
│   └─────────────────────────────┘ │   │   └─────────────────────────────┘ │
└───────────────────────────────────┘   └───────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 5: UPDATE STATE                                     │
│                                                                                  │
│   • stakerRewardDebt[user] = accRewardPerStaker (reset for next claim)          │
│   • lastSpinGameId[user] = currentGameId (can't spin again today)               │
│   • If restaked: position.stakedAmount increased, totalStaked increased         │
│   • emit RewardsClaimed(user, baseReward, finalReward, spinOutcome)             │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE EXAMPLE WALKTHROUGH                           │
└─────────────────────────────────────────────────────────────────────────────────┘

SCENARIO:
- User has 500,000 PIZZA staked (Pizza Tycoon tier 👑)
- User has a 7-day locked position
- Early staker boost is still active
- User hasn't claimed in 4 days
- Total accumulated base reward: 150 PIZZA

┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Base Reward                                                             │
│         150 PIZZA (accumulated over 4 days)                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Apply Bonuses                                                           │
│                                                                                  │
│    Base:    100%                                                                │
│    +Tier:   +20%  (Pizza Tycoon)                                                │
│    +Lock:   +10%  (7-day lock)                                                  │
│    +Early:  +30%  (first 60 days)                                               │
│    ─────────────                                                                │
│    Total:   160%                                                                │
│                                                                                  │
│    150 PIZZA × 160% = 240 PIZZA                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Spin the Pie                                                            │
│                                                                                  │
│    User spins and lands on... 🟢 JACKPOT! (2% chance)                           │
│                                                                                  │
│    240 PIZZA × 200% = 480 PIZZA                                                 │
│    (Extra 240 PIZZA comes from bonusPool)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: User Chooses "7-Day Lock" (Restake)                                     │
│                                                                                  │
│    Contract calls restake(1)                                                    │
│                                                                                  │
│    Before: 500,000 PIZZA staked                                                 │
│    After:  500,480 PIZZA staked (+480 from rewards)                             │
│                                                                                  │
│    Lock timer reset to 7 days from now                                          │
│    Still Pizza Tycoon tier (500,000+ threshold)                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ RESULT                                                                          │
│                                                                                  │
│    Started with: 150 PIZZA base reward                                          │
│    After bonuses: 240 PIZZA                                                     │
│    After JACKPOT spin: 480 PIZZA                                                │
│    Restaked into locked position: +480 PIZZA staked                             │
│                                                                                  │
│    Total multiplier: 150 → 480 = 3.2x the base reward!                          │
│                                                                                  │
│    Breakdown:                                                                    │
│    • 1.6x from bonuses (tier + lock + early)                                    │
│    • 2.0x from Jackpot spin                                                     │
│    • 1.6 × 2.0 = 3.2x total                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                              QUICK REFERENCE                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

TIER BONUSES (based on total staked):
┌────────────────┬─────────────────────┬────────────┬─────────────────┐
│ Tier           │ Minimum Stake       │ Yield Bonus│ Topping Bonus   │
├────────────────┼─────────────────────┼────────────┼─────────────────┤
│ 🍕 Slice Runner │ 0 PIZZA             │ +1.5%      │ +0/week         │
│ 🔥 Oven Operator│ 50,000 PIZZA        │ +5%        │ +1/week         │
│ 👨‍🍳 Pie Boss     │ 200,000 PIZZA       │ +10%       │ +3/week         │
│ 👑 Pizza Tycoon │ 500,000 PIZZA       │ +20%       │ +5/week         │
└────────────────┴─────────────────────┴────────────┴─────────────────┘

LOCK BONUS:
┌─────────────────┬────────────┬─────────────────────────────────────┐
│ Lock Type       │ Bonus      │ Notes                               │
├─────────────────┼────────────┼─────────────────────────────────────┤
│ Flexible        │ +0%        │ Withdraw anytime, no penalty        │
│ 7-Day Locked    │ +10%       │ 15% penalty if unstake early        │
└─────────────────┴────────────┴─────────────────────────────────────┘

EARLY STAKER BONUS:
┌─────────────────┬────────────┬─────────────────────────────────────┐
│ Period          │ Bonus      │ Notes                               │
├─────────────────┼────────────┼─────────────────────────────────────┤
│ First 60 days   │ +30%       │ Applies to ALL stakers during period│
│ After 60 days   │ +0%        │ Bonus expires for everyone          │
└─────────────────┴────────────┴─────────────────────────────────────┘

SPIN THE PIE:
┌─────────────────┬────────────┬────────────┬────────────────────────┐
│ Outcome         │ Chance     │ Multiplier │ Funded By              │
├─────────────────┼────────────┼────────────┼────────────────────────┤
│ 🟡 Regular Slice │ 73%        │ 100%       │ Normal rewards         │
│ 🟠 Loaded Slice  │ 20%        │ 110%       │ +10% from bonusPool    │
│ 🔴 Hot Out Oven  │ 5%         │ 125%       │ +25% from bonusPool    │
│ 🟢 JACKPOT      │ 2%         │ 200%       │ +100% from bonusPool   │
└─────────────────┴────────────┴────────────┴────────────────────────┘

KEY POINTS:
• Rewards distributed EQUALLY among all stakers (not proportional to stake)
• Bonuses are ADDITIVE (100% + 20% + 10% + 30% = 160%, not multiplicative)
• Rewards ACCUMULATE if not claimed - no expiration
• One spin per day per staker
• Restaking compounds your position and maintains lock bonus
