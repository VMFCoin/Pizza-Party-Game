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
│                        _calculateBaseReward(user)                                │
│                                                                                  │
│   baseReward = (accRewardPerStaker - stakerRewardDebt[user]) ÷ 1e18            │
│                                                                                  │
│   Example: User hasn't claimed in 4 days                                        │
│   baseReward = 150 PIZZA (raw 1% daily pot split equally)                       │
│                                                                                  │
│   ► This is the RAW base reward - NO bonuses applied yet!                      │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 2: SPIN THE PIE                                     │
│                    *** THIS IS THE ONLY MULTIPLICATION ***                       │
│                    (If spinEnabled = true AND hasn't spun today)                 │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │                        SPIN THE PIE                                     │   │
│   │              Multiplies the BASE reward (1% daily pot)                  │   │
│   │                                                                         │   │
│   │    ┌────────────────────────────────────────────────────────────┐      │   │
│   │    │                                                            │      │   │
│   │    │     Regular Slice    73% chance    100% of base            │      │   │
│   │    │     Loaded Slice     20% chance    110% of base            │      │   │
│   │    │     Hot Out the Oven  5% chance    125% of base            │      │   │
│   │    │     JACKPOT           2% chance    200% of base            │      │   │
│   │    │                                                            │      │   │
│   │    └────────────────────────────────────────────────────────────┘      │   │
│   │                                                                         │   │
│   │    spunReward = baseReward × spinMultiplier                             │   │
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
│   Base Reward: 150 PIZZA                                                        │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Regular Slice (73% chance)                                             │   │
│   │     spunReward = 150 × 100% = 150 PIZZA                                 │   │
│   │                                                                         │   │
│   │  Loaded Slice (20% chance)                                              │   │
│   │     spunReward = 150 × 110% = 165 PIZZA (+15 from bonusPool)            │   │
│   │                                                                         │   │
│   │  Hot Out the Oven (5% chance)                                           │   │
│   │     spunReward = 150 × 125% = 187.5 PIZZA (+37.5 from bonusPool)        │   │
│   │                                                                         │   │
│   │  JACKPOT (2% chance)                                                    │   │
│   │     spunReward = 150 × 200% = 300 PIZZA (+150 from bonusPool)           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 3: ADD BONUSES TO SPUN RESULT                            │
│                      (Bonuses are ADDED, not multiplied)                         │
│                                                                                  │
│   Bonuses are calculated as a % of the spunReward and ADDED to it              │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  + TIER BONUS (based on total staked amount)                            │   │
│   │                                                                         │   │
│   │    Slice Runner    (0 - 49,999 PIZZA):     +1.5% of spunReward          │   │
│   │    Oven Operator   (50,000 - 199,999):     +5% of spunReward            │   │
│   │    Pie Boss        (200,000 - 499,999):    +10% of spunReward           │   │
│   │    Pizza Tycoon    (500,000+):             +20% of spunReward           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  + LOCK BONUS (if user has ANY locked position)                         │   │
│   │                                                                         │   │
│   │    No Lock:   +0%                                                       │   │
│   │    7-Day Lock: +10% of spunReward                                       │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  + EARLY STAKER BONUS (first 60 days after staking launch)              │   │
│   │                                                                         │   │
│   │    Active:   +30% of spunReward                                         │   │
│   │    Expired:  +0%                                                        │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   FORMULA:                                                                      │
│   bonusAmount = spunReward × (tierBonus + lockBonus + earlyBonus)              │
│   finalReward = spunReward + bonusAmount                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         BONUS CALCULATION EXAMPLE                                │
│                                                                                  │
│   User: Pizza Tycoon tier, has 7-day lock, early boost active                   │
│   Base Reward: 150 PIZZA                                                        │
│   Spin Result: JACKPOT (2x)                                                     │
│   Spun Reward: 150 × 2.0 = 300 PIZZA                                            │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Spun Reward:  300 PIZZA                                                │   │
│   │                                                                         │   │
│   │  Bonuses (calculated on spun reward):                                   │   │
│   │    + Tier:     300 × 20% = +60 PIZZA   (Pizza Tycoon)                   │   │
│   │    + Lock:     300 × 10% = +30 PIZZA   (7-day lock)                     │   │
│   │    + Early:    300 × 30% = +90 PIZZA   (first 60 days)                  │   │
│   │    ─────────────────────────────────────────────────────────            │   │
│   │    Total Bonus:           +180 PIZZA   (60% of spun reward)             │   │
│   │                                                                         │   │
│   │  FINAL REWARD: 300 + 180 = 480 PIZZA                                    │   │
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
│   │   │   NO LOCK           │    │   7-DAY LOCK        │                   │   │
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
- User has 500,000 PIZZA staked (Pizza Tycoon tier)
- User has a 7-day locked position
- Early staker boost is still active
- User hasn't claimed in 4 days
- Total accumulated base reward: 150 PIZZA

┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Base Reward                                                             │
│         150 PIZZA (raw 1% daily pot share, accumulated over 4 days)             │
│                                                                                  │
│         This is BEFORE any spin or bonuses!                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Spin the Pie (ONLY MULTIPLICATION)                                      │
│                                                                                  │
│    User spins and lands on... JACKPOT! (2% chance)                              │
│                                                                                  │
│    spunReward = 150 PIZZA × 200% = 300 PIZZA                                    │
│    (Extra 150 PIZZA comes from bonusPool)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Add Bonuses (ADDITIVE, applied to spun result)                          │
│                                                                                  │
│    Spun Reward: 300 PIZZA                                                       │
│                                                                                  │
│    Bonuses (% of spun reward):                                                  │
│      +Tier:   300 × 20% = +60 PIZZA  (Pizza Tycoon)                             │
│      +Lock:   300 × 10% = +30 PIZZA  (7-day lock)                               │
│      +Early:  300 × 30% = +90 PIZZA  (first 60 days)                            │
│      ─────────────────────────────────                                          │
│      Total Bonus: +180 PIZZA                                                    │
│                                                                                  │
│    FINAL REWARD = 300 + 180 = 480 PIZZA                                         │
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
│ RESULT BREAKDOWN                                                                │
│                                                                                  │
│    Started with: 150 PIZZA base reward                                          │
│    After JACKPOT spin (2x): 300 PIZZA                                           │
│    After bonuses (+60%): 480 PIZZA                                              │
│    Restaked into locked position: +480 PIZZA staked                             │
│                                                                                  │
│    Total multiplier: 150 → 480 = 3.2x the base reward!                          │
│                                                                                  │
│    Breakdown:                                                                    │
│    • 2.0x from Jackpot spin (MULTIPLICATION - Step 2)                           │
│    • +60% from bonuses (ADDITION - Step 3)                                      │
│    • 150 × 2.0 = 300, then 300 + (300 × 0.6) = 480                              │
└─────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────┐
│                              QUICK REFERENCE                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

REWARD CALCULATION ORDER (CRITICAL):
┌────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: baseReward = 1% daily pot ÷ stakerCount                                │
│ STEP 2: spunReward = baseReward × spinMultiplier  (ONLY MULTIPLICATION)        │
│ STEP 3: finalReward = spunReward + (spunReward × bonusPercent)  (ADDITION)     │
└────────────────────────────────────────────────────────────────────────────────┘

TIER BONUSES (based on total staked):
┌────────────────┬─────────────────────┬────────────┬─────────────────┐
│ Tier           │ Minimum Stake       │ Yield Bonus│ Topping Bonus   │
├────────────────┼─────────────────────┼────────────┼─────────────────┤
│ Slice Runner   │ 0 PIZZA             │ +1.5%      │ +0/week         │
│ Oven Operator  │ 50,000 PIZZA        │ +5%        │ +1/week         │
│ Pie Boss       │ 200,000 PIZZA       │ +10%       │ +3/week         │
│ Pizza Tycoon   │ 500,000 PIZZA       │ +20%       │ +5/week         │
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

SPIN THE PIE (Step 2 - ONLY MULTIPLICATION):
┌─────────────────┬────────────┬────────────┬────────────────────────┐
│ Outcome         │ Chance     │ Multiplier │ Funded By              │
├─────────────────┼────────────┼────────────┼────────────────────────┤
│ Regular Slice   │ 73%        │ 100%       │ Normal rewards         │
│ Loaded Slice    │ 20%        │ 110%       │ +10% from bonusPool    │
│ Hot Out Oven    │ 5%         │ 125%       │ +25% from bonusPool    │
│ JACKPOT         │ 2%         │ 200%       │ +100% from bonusPool   │
└─────────────────┴────────────┴────────────┴────────────────────────┘

KEY POINTS:
• Rewards distributed EQUALLY among all stakers (not proportional to stake)
• SPIN is the ONLY multiplication - applied to base reward FIRST (Step 2)
• Bonuses are ADDITIVE - applied to spun result AFTER spin (Step 3)
• Rewards ACCUMULATE if not claimed - no expiration
• One spin per day per staker
• Restaking compounds your position and maintains lock bonus
