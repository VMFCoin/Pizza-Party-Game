# 🍕 PizzaParty Contract - Complete Documentation

## Overview

PizzaParty is a dual-lottery system combining daily prize draws with a weekly jackpot. Players earn "toppings" through gameplay, referrals, and VMF token holdings, which serve as weighted lottery tickets for the weekly draw.

---

## 💰 Economic Model

- **Entry Fee**: 100 VMF = $1 USD (fixed rate, no oracle)
- **Daily Pot**: Funded by player entries (100 VMF per entry)
- **Weekly Pot**: Funded by treasury wallet (1 topping = 1 VMF)

---

## 🎮 Daily Game Flow

### Game Cycle
Each daily game runs from **12pm PT to 12pm PT** (24 hours).

### Entering the Game

**Step 1: Player Entry**
```
Player calls: enterDailyGame() or enterDailyGameNoRef()
↓
Contract checks:
- Is game ended? → Auto-settle previous game
- Has player already played today? → Reject
- Has player played 7 times this week? → Reject (weekly limit)
↓
Collect 100 VMF from player
↓
Add to daily pot
```

**Step 2: First Player Bonus**
```
Is this the first player today?
↓ YES
Mark player as "firstPlayer"
- This player will receive 1% bonus when game settles
↓ NO
Continue normally
```

**Step 3: Rewards**
```
Player receives:
✓ 1 topping (added to weekly toppings)
✓ 1 entry in today's draw
✓ Increment daily plays counter (max 7/week)
```

**Step 4: Optional Referral (First-Time Players Only)**
```
Did player provide referral code?
AND
Is this their first game ever?
↓ YES
Process referral:
- Referrer gets 2 toppings
- Referee gets 0 extra toppings (already got 1 from daily entry)
- Referrer's weekly referral count increments (max 3/week)
↓ NO
Continue
```

### Auto-Settlement Logic

**When does settlement trigger?**
```
When next player enters AFTER game end time:
↓
Contract detects: block.timestamp >= game.endTime
↓
Automatically calls _settleDailyGame()
↓
New game starts
↓
New player's entry processes in fresh game
```

### Settlement Process

**Step 1: Check Players**
```
Are there 0 players?
↓ YES
Skip game, create new one, carry pot to tomorrow
↓ NO
Continue to payout
```

**Step 2: Calculate Payouts**
```
Total Pot = all entries × 100 VMF

First Player Bonus = Pot × 1% (100 basis points)
Remaining Pot = Pot - First Player Bonus

Number of Winners = min(8, number of players)
Base Share Per Winner = Remaining Pot ÷ Number of Winners
```

**Example with 50 players, 5000 VMF pot:**
```
First Player Bonus: 5000 × 1% = 50 VMF
Remaining Pot: 5000 - 50 = 4950 VMF
Winners: 8
Base Share: 4950 ÷ 8 = 618.75 VMF each
First Player Total: 50 VMF + (618.75 if they win) = 50-668.75 VMF
```

**Step 3: Select Winners**
```
Use pseudo-random selection:
- Hash: block.prevrandao + block.timestamp + gameId + pot
- Pick 8 unique players randomly
- Each player has equal odds (not weighted)
```

**Step 4: Distribute Prizes**
```
Pay first player their 1% bonus (50 VMF)
↓
Pay each of 8 winners their base share (618.75 VMF each)
↓
Any dust/remainder goes to winner #1
↓
Mark game as settled
↓
Reset daily pot to 0
↓
Increment dailyGameId
↓
Create next game (ends 24 hours from now at 12pm PT)
```

---

## 📅 Weekly Jackpot Flow

### Weekly Cycle Timeline

```
Monday 12pm PT → Sunday 12pm PT
Players earn toppings (6 days)
↓
Sunday 12pm PT → Monday 12pm PT
Claim Window Opens (24 hours)
↓
Monday 12pm PT
Claim Window Closes + Settlement
↓
New week begins
```

### Earning Toppings (All Week Long)

**1. Daily Game Plays**
```
Play daily game → Earn 1 topping
Maximum: 7 toppings per week (7 days)
Resets: When new weekly game starts
```

**2. Referrals**
```
Someone uses your referral code (first time ever) → Earn 2 toppings
Maximum: 3 referrals per week = 6 toppings
Resets: When new weekly game starts
Note: Referee earns 0 bonus (just their 1 from daily play)
```

**3. VMF Holdings Bonus**
```
This is calculated when you claim, not before.
```

### Example Week Progression

**Monday-Saturday: Earning Phase**
```
Player "Alice":
- Plays 5 daily games: 5 toppings
- 2 people use her referral code: 4 toppings
- Currently holds 35,000 VMF
- Total earned: 9 toppings (not yet claimed)
```

### Claim Window (Sunday 12pm PT → Monday 12pm PT)

**Step 1: Claim Window Opens**
```
Sunday exactly at 12pm PT (20:00 UTC)
↓
Contract state:
- claimWindowStart timestamp is reached
- Players can now call claimToppings()
```

**Step 2: Player Claims**
```
Alice calls: claimToppings()
↓
Contract checks:
- Is claim window open? ✓
- Has Alice already claimed this week? ✗
- Does Alice have earned toppings? ✓ (9 toppings)
↓
Calculate VMF Holdings Bonus AT CLAIM TIME:
- Read Alice's current VMF balance: 35,000 VMF
- Calculate: 35,000 ÷ 10,000 = 3 units
- Holdings bonus: 3 units × 3 toppings = 9 toppings
↓
Add holdings bonus to earned toppings:
- Earned: 9 toppings
- Holdings: 9 toppings
- Total: 18 toppings
↓
Finalize claim:
- Mark toppingsClaimed = 18
- Mark hasClaimed = true
- Add 18 to week's totalClaimedToppings
- Add Alice to claimers array
- Emit event
```

**Important Notes:**
- VMF balance is checked **when you claim**, not at window opening
- You can only claim **once per week**
- Claiming is **all-or-nothing** (you claim all earned toppings)
- If you don't claim before Monday 12pm PT, toppings **expire**

**Step 3: Projected vs Actual Jackpot**

**Before Claims:**
```
UI shows "Projected Jackpot":
= All players' potential toppings IF everyone claimed
= Optimistic estimate
```

**During Claims:**
```
UI updates dynamically:
= (Total claimed so far) + (Projected from unclaimed players)
= Mixed actual + projected
```

**After Claim Window Closes:**
```
Final Jackpot:
= totalClaimedToppings × 1 VMF
= Only actual claimed toppings count
```

**Example:**
```
Week 1 Toppings Earned by All Players: 1000 toppings

Projected Jackpot (before claims): 1000 VMF
↓
During claim window, only 700 toppings claimed
↓
Actual Jackpot: 700 VMF (300 toppings expired)
```

### Weekly Settlement (Monday 12pm PT)

**Step 1: Claim Window Closes**
```
Monday exactly at 12pm PT
↓
No more claims accepted
↓
Calculate final jackpot
```

**Step 2: Pull Funds from Treasury**
```
Jackpot = totalClaimedToppings × 1 VMF

Example: 700 toppings claimed
Jackpot = 700 VMF
↓
Contract calls:
vmfToken.safeTransferFrom(treasuryWallet, address(this), 700 VMF)
↓
Treasury must have approved contract to spend VMF
```

**Step 3: Select Weighted Winners**
```
Algorithm:
- 10 winners selected
- More toppings = better odds
- Uses weighted random selection with binary search

Example weights:
Alice: 18 toppings (2.57% of 700)
Bob: 50 toppings (7.14% of 700)
Carol: 5 toppings (0.71% of 700)
...

Bob has ~2.8x better odds than Alice
Alice has ~3.6x better odds than Carol
```

**Step 4: Distribute Weekly Prizes**
```
Number of Winners = min(10, number of claimers)
Payout Per Winner = Jackpot ÷ Number of Winners

Example: 700 VMF, 10 winners
Each winner: 70 VMF
Remainder (dust): First winner gets extra

Transfer to each winner
↓
Mark week as settled
↓
Increment weeklyGameId
↓
Create next week (claim window opens next Sunday)
```

**Step 5: Weekly Reset**
```
New week begins:
- All player toppingsEarned reset to 0
- All player dailyPlays reset to 0
- All player referralsUsed reset to 0
- All player hasClaimed reset to false
- New claim window scheduled (next Sunday)
```

---

## 🎟️ Topping Economics

### Maximum Toppings Per Week

```
Daily plays: 7 days × 1 topping = 7 toppings
Referrals: 3 referrals × 2 toppings = 6 toppings
Holdings: varies by balance

Example balances:
- 10,000 VMF → 3 toppings
- 50,000 VMF → 15 toppings
- 100,000 VMF → 30 toppings

Maximum possible (excluding holdings):
7 + 6 = 13 toppings/week from gameplay
```

### Holdings Bonus Calculation

**Formula:**
```
VMF Balance ÷ 10,000 = Number of Units
Number of Units × 3 = Holdings Toppings

Examples:
9,999 VMF → 0 units → 0 toppings (below threshold)
10,000 VMF → 1 unit → 3 toppings
19,999 VMF → 1 unit → 3 toppings
20,000 VMF → 2 units → 6 toppings
35,000 VMF → 3 units → 9 toppings
100,000 VMF → 10 units → 30 toppings
```

**Key Points:**
- Checked **only when claiming** during claim window
- Based on **current balance** at claim time
- Not a snapshot at window opening
- Whales can accumulate VMF before claiming

---

## 🔗 Referral System

### Creating a Referral Code

```
Player calls: createReferralCode()
↓
Contract generates code:
- Hash player address + timestamp
- Convert to hex: "PZ" + 8 characters
- Example: "PZ4A7F2B9C"
↓
Store mappings:
- playerReferralCode[player] = "PZ4A7F2B9C"
- codeToPlayer["PZ4A7F2B9C"] = player
```

### Using a Referral Code

**Requirements:**
```
✓ Must be referee's FIRST game ever (hasUsedReferral = false)
✓ Referrer must have < 3 referrals this week
✓ Cannot refer yourself
✓ Code must exist
```

**Process:**
```
New player "Dave" enters daily game with code "PZ4A7F2B9C"
↓
Contract checks all requirements
↓
Mark Dave as hasUsedReferral = true (lifetime, never resets)
↓
Increment referrer's weeklyReferralsUsed counter
↓
Award toppings:
- Referrer (Alice): +2 toppings
- Referee (Dave): +0 bonus (already got 1 from daily entry)
↓
Emit events
```

**Weekly Limit:**
```
Referrer can earn from 3 successful referrals per week:
Week 1: 3 referrals × 2 toppings = 6 toppings max
Week 2: Counter resets, 3 more referrals possible
```

**Lifetime Usage:**
```
Each player can only USE a referral code once in their lifetime.
Dave can never use another referral code, even in future weeks.
```

---

## ⏰ Time Anchoring

### Daily Games: 12pm PT

```
Pacific Time = UTC - 8 hours (PST) or UTC - 7 hours (PDT)
12pm PT = 20:00 UTC (simplified, always use PT offset of 8 hours)

Game 1: Monday 12pm PT → Tuesday 12pm PT
Game 2: Tuesday 12pm PT → Wednesday 12pm PT
...
```

**How _nextNoonPT() works:**
```
Current time: Tuesday 3:45pm PT
↓
Calculate today's noon PT
↓
Is current time past noon? YES
↓
Return tomorrow's noon PT (Wednesday 12pm PT)
```

### Weekly Games: Sunday 12pm PT Claim Window

```
Week 1 Earn Phase: Monday 12pm PT → Sunday 12pm PT (6 days)
Week 1 Claim Window: Sunday 12pm PT → Monday 12pm PT (24 hours)
Week 1 Settlement: Monday 12pm PT
Week 2 Starts: Monday 12pm PT

Cycle repeats
```

**How _nextSundayNoonPT() works:**
```
Current time: Thursday 5pm PT
↓
Calculate days until Sunday
↓
Thursday = 4, Sunday = 0, so 3 days until Sunday
↓
Return next Sunday 12pm PT
```

---

## 🎲 Randomness

### Daily Winners (Unweighted)

```
Seed = hash(
    block.prevrandao,  // VRF-like randomness from validator
    block.timestamp,    // Current block time
    gameId,            // Unique game identifier
    currentDailyPot    // Pot amount for extra entropy
)

For each winner selection:
    seed = hash(seed + iteration)
    index = seed % number_of_players
    if not already selected:
        add to winners
```

**Properties:**
- Unpredictable until block is mined
- Each player has equal probability
- No duplicates (checks selected array)

### Weekly Winners (Weighted)

**Step 1: Build Cumulative Weight Array**
```
Players and their claimed toppings:
Alice: 18 toppings
Bob: 50 toppings
Carol: 5 toppings

Prefix sums:
[0]: 18 (Alice)
[1]: 68 (Bob = 18 + 50)
[2]: 73 (Carol = 68 + 5)

Total weight: 73
```

**Step 2: Random Selection**
```
Draw random number: 0-72
↓
Binary search in prefix sums to find winner
↓
Example draws:
- 0-17 → Alice wins
- 18-67 → Bob wins
- 68-72 → Carol wins

Bob's odds: 50/73 = 68.5%
Alice's odds: 18/73 = 24.7%
Carol's odds: 5/73 = 6.8%
```

**Step 3: No Duplicates**
```
Repeat selection up to count × 3 attempts
Track selected[] array
Only add unique winners
```

---

## 📊 Complete Example Scenario

### Week 1: Alice's Journey

**Monday-Saturday (Earning Phase)**
```
Day 1: Alice plays → 1 topping (total: 1)
Day 2: Alice plays → 1 topping (total: 2)
Day 3: Alice creates referral code "PZ4A7F2B9C"
Day 3: Alice plays → 1 topping (total: 3)
Day 4: Bob uses Alice's code & plays → Alice +2 toppings (total: 5)
Day 4: Alice plays → 1 topping (total: 6)
Day 5: Carol uses Alice's code & plays → Alice +2 toppings (total: 8)
Day 6: Alice plays → 1 topping (total: 9)
Day 7: Dave uses Alice's code & plays → Alice +2 toppings (total: 11)
        (Alice hits 3 referral limit)

Alice's earned toppings: 11
Alice's VMF balance: 35,000 VMF
```

**Sunday 12pm PT (Claim Window Opens)**
```
Alice calls claimToppings()
↓
Holdings bonus calculated:
35,000 VMF ÷ 10,000 = 3 units
3 units × 3 = 9 toppings
↓
Total claimed: 11 + 9 = 20 toppings
↓
Alice is now in the weekly draw with 20 tickets
↓
Weekly pot increases by 20 VMF
```

**Monday 12pm PT (Settlement)**
```
Total players claimed: 50 players
Total toppings claimed: 800 toppings
Final jackpot: 800 VMF (pulled from treasury)
↓
10 winners selected (weighted)
Alice's odds: 20/800 = 2.5% per winner slot
↓
If Alice wins: 800 ÷ 10 = 80 VMF payout
```

**Daily Game Example (Same Day)**
```
Monday morning, before weekly settlement:
↓
Alice enters daily game (new week just started)
- Pays 100 VMF
- Is first player today → marked for 1% bonus
- Earns 1 topping for new week
- Daily pot: 100 VMF
↓
Throughout the day, 49 more players enter
- Daily pot: 5,000 VMF
↓
Tuesday 12pm PT (Next day):
- First new entrant triggers settlement
- Alice gets 1% bonus: 50 VMF
- 8 winners selected randomly
- Each winner: (5000 - 50) ÷ 8 = 618.75 VMF
- If Alice wins: 50 + 618.75 = 668.75 VMF total
- If Alice doesn't win: 50 VMF total
```

---

## 🔐 Admin Functions

### Treasury Management
```solidity
setTreasuryWallet(address _treasury)
```
Updates the wallet that funds weekly jackpots. Treasury must approve contract to spend VMF.

### Emergency Controls
```solidity
emergencyWithdraw()
```
Owner can withdraw all VMF from contract (use if critical bug found).

```solidity
emergencySettleDaily()
```
Owner can force-settle current daily game immediately.

```solidity
emergencySettleWeekly()
```
Owner can force-settle current weekly game immediately.

---

## 🔍 View Functions

### Game Status
```solidity
getCurrentDailyGame()
```
Returns: startTime, endTime, playerCount, pot, settled

```solidity
getCurrentWeeklyGame()
```
Returns: claimStart, claimEnd, totalToppings, claimerCount, projectedJackpot, settled

### Player Status
```solidity
getPlayerWeeklyInfo(address player)
```
Returns: toppingsEarned, toppingsClaimed, dailyPlays, referralsUsed, hasClaimed, projectedHoldingsBonus

```solidity
hasPlayedDailyGame(address player)
```
Returns: true if played today

### Referral Info
```solidity
getReferralCode(address player)
```
Returns: player's referral code

```solidity
getPlayerFromCode(string code)
```
Returns: address that owns the code

### Settlement Checks
```solidity
isDailyGameReady()
```
Returns: true if game ended and not yet settled

```solidity
isClaimWindowOpen()
```
Returns: true if currently in claim window

```solidity
isWeeklyGameReady()
```
Returns: true if claim window closed and not yet settled

---

## 📝 Key Invariants

1. **Each player can play max 7 daily games per week**
2. **Each referrer can earn from max 3 referrals per week**
3. **Each player can only use a referral code once (lifetime)**
4. **Each player can claim toppings once per week**
5. **Daily pot never includes weekly funds (separate accounting)**
6. **Weekly jackpot always pulls from treasury (never uses daily pot)**
7. **First player bonus is always 1% of daily pot**
8. **Unclaimed toppings expire when claim window closes**
9. **Holdings bonus calculated at claim time, not window opening**
10. **Games auto-settle when next player enters after end time**

---

## ⚠️ Important Notes

### Gas Costs
- Daily entry: ~100k gas (includes topping logic + possible settlement)
- Claim toppings: ~80k gas (includes holdings calculation)
- Settlement: Varies by player count (50-200k gas)

### Treasury Requirements
- Must approve contract to spend VMF
- Must maintain balance ≥ projected weekly jackpot
- Approval should be generous (e.g., 100,000 VMF)

### Player Considerations
- **Must claim during window** or lose toppings
- **Cannot increase VMF holdings after claiming** (snapshot at claim time)
- **First entry of each day** = potential 1% bonus (race condition)
- **Referral codes** are one-time use per referee

### Security
- ReentrancyGuard on all state-changing functions
- Checks-effects-interactions pattern
- No external calls before state updates
- Randomness uses block.prevrandao (post-merge VRF)

---

## 🚀 Deployment Checklist

1. Deploy contract with VMF token address and treasury wallet
2. Treasury wallet approves contract for large VMF amount
3. Fund treasury with sufficient VMF for weekly jackpots
4. Monitor gas costs and optimize if needed
5. Set up off-chain monitoring for:
   - Daily game settlements
   - Weekly claim windows
   - Weekly settlements
   - Treasury balance

---

## 📈 Future Enhancements (Not in Current Contract)

- Multiple winner tiers (1st, 2nd, 3rd place)
- Dynamic entry fees based on pot size
- NFT integration for bonus tickets
- On-chain VRF for provable randomness
- Governance for parameter changes
- Historical stats tracking

---

**Contract Version**: 1.0 Minimal  
**Last Updated**: 2025-11-14  
**Solidity Version**: ^0.8.20  
**License**: MIT
