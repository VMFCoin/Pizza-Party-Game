# Pizza Party Whitepaper

**Version:** 3.0
**Last Updated:** March 2026
**Network:** Base (Ethereum Layer 2)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Vision & Mission](#2-vision--mission)
3. [The $PIZZA Token](#3-the-pizza-token)
4. [Token Supply & Distribution](#4-token-supply--distribution)
5. [The Daily Game](#5-the-daily-game)
6. [The Weekly Jackpot](#6-the-weekly-jackpot)
7. [Staking System](#7-staking-system)
8. [Spin the Pie: Reward Multiplier](#8-spin-the-pie-reward-multiplier)
9. [Staking Reward Calculation: Complete Walkthrough](#9-staking-reward-calculation-complete-walkthrough)
10. [Pizza Parlors: The Sponsorship Economy](#10-pizza-parlors-the-sponsorship-economy)
11. [Referral System](#11-referral-system)
12. [Charitable Allocation](#12-charitable-allocation)
13. [Smart Contract Architecture](#13-smart-contract-architecture)
14. [Technical Infrastructure](#14-technical-infrastructure)
15. [Security Model](#15-security-model)
16. [Engagement Loops & Retention Design](#16-engagement-loops--retention-design)
17. [Deflationary Mechanics](#17-deflationary-mechanics)
18. [Roadmap](#18-roadmap)
19. [Risks & Disclaimers](#19-risks--disclaimers)
20. [Contract Addresses & Links](#20-contract-addresses--links)

---

## 1. Introduction

Pizza Party is a daily social lottery game and token ecosystem built natively on the Base network. It combines accessible, low-stakes daily gameplay with a multi-layered staking and sponsorship economy, all powered by the $PIZZA token.

The protocol runs as a Farcaster MiniApp, embedding directly into the social layer where crypto-native users already spend their time. Every game, every reward distribution, and every charitable donation executes automatically through verified smart contracts — no intermediaries, no manual processes.

Pizza Party is live on Base mainnet today, running daily games and distributing rewards to players, stakers, parlor owners, and charities.

---

## 2. Vision & Mission

**Vision:** To build the daily habit layer for on-chain entertainment — a game people play every day, not because of hype, but because it's fun, fair, and rewarding.

**Mission:** Create a sustainable on-chain game economy that:

- Makes blockchain gaming accessible at ~$1 per entry
- Rewards every type of participant — players, stakers, sponsors, and holders
- Directs a meaningful portion of all activity to charitable causes, transparently and automatically
- Demonstrates that on-chain applications can be socially impactful without sacrificing user experience

**Design Principles:**

- **Fairness over extraction.** 80% of every pot goes back to players. Staking rewards are distributed equally regardless of stake size.
- **Transparency by default.** All contracts are verified on BaseScan. Every distribution, every charity transfer, every winner selection is publicly auditable.
- **Sustainability over speculation.** Fixed token supply. Deflationary burns built into the parlor system. No minting. No inflation.
- **Simplicity of participation.** One click to enter. One spin to claim. No complex DeFi knowledge required.

---

## 3. The $PIZZA Token

$PIZZA is a utility token that functions as the entry, reward, and staking asset across the entire Pizza Party ecosystem.

| Attribute | Value |
|-----------|-------|
| Name | Pizza |
| Symbol | PIZZA |
| Network | Base (Ethereum L2) |
| Standard | ERC-20 with EIP-2612 Permit |
| Decimals | 18 |
| Total Supply | 100,000,000,000 (100 Billion) |
| Minting | None — fixed supply, zero inflation |

The contract contains no minting functionality. The total supply was minted at deployment and can never be increased. This creates a hard cap that, combined with the parlor burn mechanism, makes $PIZZA structurally deflationary over time.

EIP-2612 permit support enables single-transaction game entries — players approve and enter in one step, eliminating the typical two-transaction friction of ERC-20 interactions.

### What $PIZZA Is

- A participation token for daily and weekly games
- A staking asset that earns yield from game activity
- A sponsorship currency through the parlor system
- A charitable vehicle directing funds to veteran-support organizations

### What $PIZZA Is Not

$PIZZA does not represent equity, ownership, governance rights, or an investment contract in any entity.

---

## 4. Token Supply & Distribution

| Allocation | Amount | Percentage | Purpose |
|------------|--------|------------|---------|
| Treasury | 40,000,000,000 | 40% | Ecosystem development, operations, game subsidies |
| Staking Rewards | 35,000,000,000 | 35% | Staker bonus payouts, spin multiplier funding, APY |
| Liquidity Pool | 10,000,000,000 | 10% | DEX trading liquidity on Base |
| Marketing | 10,000,000,000 | 10% | Growth, partnerships, user acquisition |
| Team | 5,000,000,000 | 5% | Core team allocation |

**Key separation:** The Staking Rewards wallet is completely independent from Treasury. It exclusively funds staker bonuses, Spin the Pie multiplier payouts, and locked position APY. This ensures staking rewards can never be redirected to operational spending.

---

## 5. The Daily Game

The Daily Game is the core mechanic of Pizza Party — a simple, accessible lottery that resets every day.

### How It Works

1. **Enter:** Players spend ~$1 worth of $PIZZA to enter the day's game. The entry cost adjusts dynamically based on the current token price, fetched from DexScreener with GeckoTerminal as fallback.
2. **Play:** Players are added to the day's pot. The first player in each game is recorded (for potential early bird bonuses).
3. **Settle:** At 12:00 PM PST (20:00 UTC) daily, the settlement bot triggers the `settleDailyGame` function on-chain.
4. **Win:** 8 winners are selected. The pot is distributed automatically.

### Pot Distribution

| Recipient | Percentage | Description |
|-----------|------------|-------------|
| Winners | 80% | Split equally among 8 daily winners (10% each) |
| Stakers | 10% | Distributed equally to all active stakers |
| Parlor Owners | 7% | Franchise fee revenue for parlor operators |
| Charities | 3% | Automatically sent to registered veteran-support charities |

If fewer than 8 players enter, all players win and split the 80% winners pool equally.

### Participation Limits

- Maximum 7 entries per wallet per week
- Entry cost: ~$1 USD worth of $PIZZA (dynamically calculated)
- Games reset daily at 12:00 PM PST

### Settlement Process

Settlement is automated via a cron-triggered API route that:

1. Checks if the current daily game is ready to settle (`isDailyGameReady`)
2. Fetches the current $PIZZA price from DexScreener (with GeckoTerminal fallback and retry logic)
3. Removes any banned players from the game before settlement (their entry fees remain in the pot, increasing payouts for legitimate players)
4. Calls `settleDailyGameWithUsd` with the USD value per winner, locking the dollar value at settlement time
5. Allocates parlor franchise fees
6. Updates the holdings unit for topping calculations
7. Syncs staker data to the off-chain database

---

## 6. The Weekly Jackpot

The Weekly Jackpot provides an additional reward layer driven by accumulated "toppings" — lottery entries earned through multiple engagement channels throughout the week.

### Earning Toppings

| Action | Toppings Earned | Weekly Limit |
|--------|-----------------|--------------|
| Daily game entry | +1 per entry | 7 |
| 7-day play streak | +3 bonus | 1 |
| Successful referral | +2 per referral | 3 (6 toppings max) |
| Holdings bonus ($10 worth of $PIZZA held) | +1 per $10 held | 5 |
| Staking tier bonus | Varies by tier | See Staking section |

### Staking Tier Topping Bonuses

| Tier | Bonus Toppings per Week |
|------|------------------------|
| Slice Runner | +0 |
| Oven Operator | +1 |
| Pie Boss | +3 |
| Pizza Tycoon | +5 |

### Claim Window

- **Opens:** Sunday 12:00 PM PST
- **Closes:** Monday 12:00 PM PST
- Players must claim their toppings during this 24-hour window to be eligible

### Winner Selection

- 10 winners drawn weekly (or fewer if participation is low)
- Selection is **weighted by topping count** — more toppings means higher probability of winning
- The jackpot is split equally among all winners

### Jackpot Calculation

```
Weekly Jackpot = (Total Claimed Toppings x Topping Unit Value) + Treasury Bonus
```

The topping unit value adjusts dynamically based on the $PIZZA price to maintain consistent dollar-equivalent jackpot value. The treasury can add a bonus amount to increase jackpot attractiveness.

---

## 7. Staking System

The Pizza Party staking system allows $PIZZA holders to earn passive rewards from daily game activity while receiving tiered bonuses based on their commitment level.

### Core Design: Equal Distribution

Unlike typical DeFi staking where rewards are proportional to stake size, Pizza Party uses an **equal distribution model**: all stakers receive the same base reward regardless of how much they've staked. This promotes fairness and accessibility — a small staker earns the same base payout as a whale.

Differentiation comes from tiers, locks, and the Spin the Pie multiplier, which reward commitment and engagement rather than raw capital.

### Staking Tiers

| Tier | Name | Minimum Stake | Yield Bonus | Weekly Toppings |
|------|------|---------------|-------------|-----------------|
| 0 | Slice Runner | 0 – 499,999,999 PIZZA | +1.5% | +0 |
| 1 | Oven Operator | 500,000,000 PIZZA | +3% | +1 |
| 2 | Pie Boss | 2,000,000,000 PIZZA | +7% | +3 |
| 3 | Pizza Tycoon | 5,000,000,000 PIZZA | +15% | +5 |

Tier is determined by total staked amount across all positions (flexible + locked combined).

### Position Types

Users can hold up to **two independent positions** simultaneously:

**Flexible Position**
- No lock period
- Withdraw anytime without penalty
- Receives base rewards + tier bonus only

**Locked Position (7-Day)**
- 7-day lock period
- +5% yield bonus on all rewards
- 20% annual APY on staked principal
- Early withdrawal incurs 15% penalty on the withdrawn amount
- Lock timer resets if rewards are restaked

### Staking Parameters

| Parameter | Value |
|-----------|-------|
| Minimum Stake | ~$1 USD worth of PIZZA (dynamic) |
| Maximum Stake | 10,000,000,000 PIZZA per wallet (10% of supply) |
| Lock Duration | 7 days |
| Lock Yield Bonus | +5% |
| Early Unstake Penalty | 15% |
| Locked Position APY | 20% annual |

### Early Staker Boost

For the first 60 days following staking launch, all stakers receive an additional **+30% bonus** on all rewards, regardless of tier or lock status. This incentivizes early adoption and bootstraps the staking pool.

### Reward Source

Staking rewards come from 10% of every daily game pot, delivered to the staking contract via the `notifyRewardAmount` function during settlement. If no stakers exist when rewards arrive, the amount is added to the bonus pool for later distribution.

---

## 8. Spin the Pie: Reward Multiplier

Spin the Pie is a gamified reward mechanic that allows stakers to multiply their pending rewards through an interactive wheel spin.

### How It Works

1. Staker opens the claim interface and sees their accumulated base reward
2. Staker spins the pizza wheel (one spin per day per staker)
3. The wheel reveals a multiplier outcome
4. The multiplied reward (plus bonuses) can be claimed to wallet or restaked

### Spin Outcomes

| Outcome | Probability | Multiplier | Effect |
|---------|-------------|------------|--------|
| Regular Slice | 73% | 1.0x | Standard payout (no change) |
| Loaded Slice | 20% | 1.1x | +10% bonus |
| Hot Out the Oven | 5% | 1.5x | +50% bonus |
| JACKPOT | 2% | 4.0x | 4x payout + 10,000,000 PIZZA fixed bonus |

### Jackpot Rules

- Only one jackpot can be won per game day across all stakers
- If a second jackpot is spun on the same day, it automatically downgrades to "Hot Out the Oven" (1.5x)
- Jackpot winners receive 10,000,000 PIZZA as a fixed bonus in addition to the 4x multiplier

### Bonus Pool Funding

Payouts exceeding 100% (the multiplier bonus portion) are funded by the **Staking Rewards Wallet** (the dedicated 35B allocation), which must have sufficient $PIZZA approved for the staking contract to spend. This ensures base game economics are never affected by spin outcomes.

### Spin Tracking

Each staker's last spin is tracked by `lastSpinGameId` — once a staker spins for a given daily game, they cannot spin again until the next game day. The spin feature is toggleable by the contract owner and starts disabled by default.

---

## 9. Staking Reward Calculation: Complete Walkthrough

Understanding exactly how staking rewards are calculated is central to the protocol's transparency promise. The calculation follows a strict 4-step process.

### Step 1: Base Reward (Equal Distribution)

```
Base Reward = (10% of Daily Pot) / Number of Active Stakers
```

Every staker receives the same base amount. A staker with 100 PIZZA staked earns the same base reward as a staker with 5,000,000,000 PIZZA staked. Rewards accumulate daily and do not expire — if a staker doesn't claim for a week, their base reward reflects all 7 days of accumulated pot shares.

### Step 2: Spin the Pie (Multiplication)

```
Spun Reward = Base Reward x Spin Multiplier
```

This is the **only multiplication** in the entire reward calculation. The spin outcome (1.0x, 1.1x, 1.5x, or 4.0x) is applied directly to the accumulated base reward. Any payout above 1.0x is funded from the bonus pool.

### Step 3: Apply Bonuses (Addition)

```
Bonus Amount = Spun Reward x (Tier Bonus % + Lock Bonus % + Early Staker Bonus %)
Final Reward = Spun Reward + Bonus Amount
```

Bonuses are **additive, not multiplicative**. They are calculated as a percentage of the spun reward and added on top:

- **Tier Bonus:** +1.5% (Slice Runner) / +3% (Oven Operator) / +7% (Pie Boss) / +15% (Pizza Tycoon)
- **Lock Bonus:** +5% if the staker has any locked position
- **Early Staker Bonus:** +30% during the first 60 days after staking launch

### Step 4: Claim or Restake

After seeing their final reward amount, the staker chooses:

- **Claim (No Lock):** Tokens are transferred directly to the staker's wallet
- **Restake (7-Day Lock):** Rewards are added to the staker's locked position, the lock timer resets to 7 days, and the staker benefits from the +5% lock bonus on all future claims

### Full Example

**Scenario:** Pizza Tycoon tier, 7-day locked position, early boost active, 4 days of unclaimed rewards.

| Step | Calculation | Result |
|------|-------------|--------|
| Base Reward | 4 days accumulated | 150 PIZZA |
| Spin Result | JACKPOT (4.0x) | 150 x 4.0 = 600 PIZZA |
| Tier Bonus | 600 x 15% | +90 PIZZA |
| Lock Bonus | 600 x 5% | +30 PIZZA |
| Early Boost | 600 x 30% | +180 PIZZA |
| **Final Reward** | 600 + 90 + 30 + 180 | **900 PIZZA** |
| Jackpot Bonus | Fixed bonus | +10,000,000 PIZZA |

The staker chooses "Restake" — 900 PIZZA (plus the jackpot bonus) is added to their locked position, the lock timer resets, and their tier progress increases.

---

## 10. Pizza Parlors: The Sponsorship Economy

Pizza Parlors are virtual franchise establishments that enable a unique sponsorship economy within the Pizza Party ecosystem. Parlor owners can sponsor other players, earn franchise fee revenue, and build named brands.

### Purchasing a Parlor

- **Cost:** ~$50 USD worth of $PIZZA (dynamically calculated using current DEX price)
- **System Limit:** 100 parlors maximum
- **Per-Wallet Limit:** 5 parlors per wallet

### Purchase Fee Distribution

| Destination | Percentage | Effect |
|-------------|------------|--------|
| Burned | 50% | Permanently removed from circulation |
| Treasury | 30% | Ecosystem development |
| Operations | 20% | Marketing and growth |

The 50% burn on every parlor purchase creates a direct deflationary pressure on $PIZZA supply. Every parlor sold permanently reduces the circulating supply.

### Sponsorship: The Slice System

Parlor owners can "slice" other players — sending them free game entries funded by the treasury:

1. **Send a Slice:** Parlor owner selects a recipient and sends a pending slice
2. **Claim the Slice:** Recipient opens Pizza Party and claims their pending slice, entering the daily game for free
3. **Revenue Sharing:** If the sponsored player wins, the reward is split 50/50 between the player and the sponsoring parlor owner

### Slice Limits

| Parlors Owned | Weekly Slices | Daily Maximum |
|---------------|---------------|---------------|
| 1 | 1 | 1 |
| 2 | 2 | 1 |
| 3 | 3 | 1 |
| 4 | 4 | 1 |
| 5 (max) | 7 (1 per day) | 1 |

Slices can also be distributed via **EIP-712 signed vouchers** — cryptographically signed shareable links that anyone can redeem without the sponsor being online. This enables frictionless distribution through social media, messaging apps, and group chats.

### Anti-Gaming Protections

- Parlor owners cannot send slices to themselves
- Parlor owners cannot send slices to other parlor owners
- Slices expire when the daily game changes
- One slice per day per sponsor (sent limit)
- Nonce-based voucher system prevents reuse

### Franchise Fee Revenue

Parlor owners earn a share of the 7% parlor allocation from every daily pot:

| Destination | Percentage |
|-------------|------------|
| Parlor Owners | 50% (split proportionally by parlors owned) |
| Treasury | 30% |
| Operations | 20% |

Fee distribution is handled by the `allocateFees` function on the PizzaParlorManager contract. Fees accumulate in each owner's claimable balance and can be withdrawn at any time via `claimMyFees`.

### Parlor Naming

Each parlor owner can set a franchise name (up to 20 characters, set once). This creates brand identity and social visibility within the ecosystem.

---

## 11. Referral System

Pizza Party includes a player-driven referral system that rewards both the referrer and the new player.

### How It Works

1. Players generate a unique referral code (one per wallet, created lazily on first game entry)
2. New players enter the referral code when joining their first game
3. Both parties earn topping bonuses

### Referral Rewards

| Party | Reward | Weekly Limit |
|-------|--------|--------------|
| Referrer | +2 toppings per successful referral | 3 referrals (6 toppings max) |
| Referred Player | +2 toppings | Applied on entry |

Referral codes are stored on-chain via `playerReferralCode` and `codeToPlayer` mappings, ensuring tamper-proof attribution.

---

## 12. Charitable Allocation

3% of every daily pot is automatically directed to registered veteran-support charities. This is not a pledge or a promise — it is programmatic, on-chain, and executes at every settlement without exception.

### How It Works

During each daily game settlement, the smart contract calculates 3% of the total pot (`CHARITY_TOTAL_BPS = 300`) and distributes it equally among all registered charity wallets. The transfer happens in the same transaction as the winner payouts — there is no separate process, no manual step, and no way for the allocation to be skipped.

### Registered Charities

| Organization | Wallet Address |
|-------------|----------------|
| Patriots Promise | `0x6456879a5073038b0E57ea8E498Cb0240e949fC3` |
| Victory For Veterans | `0x700B53ff9a58Ee257F9A2EFda3a373D391028007` |
| Holy Family Village | `0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1` |
| Camp Cowboy | `0x5951A4160F73b8798D68e7177dF8af6a7902e725` |
| Veterans In Need Project | `0xfB0EF51792c36Ae1fE6636603be199788819b67D` |
| Honor HER Foundation | `0x10F01632DC709F7fA413A140739D8843b06235A1` |
| Magicians On Mission | `0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0` |
| April Forces | `0x043820C97771c570d830bB0e189778Fdef5E6EEb` |
| Little Patriots Embraced | `0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9` |

### Transparency

Every charitable transfer is visible on BaseScan. Anyone can verify the exact amounts sent to each charity wallet for every game ever played. The contract owner can add or remove charity wallets via `setCharityWallets`, `addCharityWallet`, and `removeCharityWallet` functions. The maximum number of registered charities is capped at 20.

---

## 13. Smart Contract Architecture

The Pizza Party ecosystem is powered by three core smart contracts, all deployed on Base mainnet using the UUPS (Universal Upgradeable Proxy Standard) pattern.

### Contract Overview

| Contract | Address | Purpose | Lines |
|----------|---------|---------|-------|
| $PIZZA Token | `0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07` | ERC-20 token with EIP-2612 permit and burn | — |
| PizzaPartyV2 | `0xA1C31c3eF1448351da0b1D430148660982B6f3dD` | Daily game, weekly jackpot, pot distribution, topping system | 1,570 |
| PizzaStakingV1 | `0xCbAf5bACe5419710C3852653d3DdEB831d7415be` | Staking positions, tiered rewards, Spin the Pie | 1,772 |
| PizzaParlorManager | `0x7acfaa1dadd836404a8d90b49581758c4fdc889b` | Parlor ownership, slice distribution, franchise fees | 1,045 |

### Why UUPS?

The UUPS proxy pattern allows the team to:

- Fix bugs without losing user funds or staking positions
- Add new features (e.g., new game modes, governance) without redeploying
- Upgrade logic while preserving all on-chain state (balances, positions, game history)

Upgrade authorization is restricted to the contract owner via `_authorizeUpgrade`.

### Contract Interactions

```
                    ┌──────────────────┐
                    │   $PIZZA Token   │
                    │   (ERC-20 +      │
                    │    Permit +      │
                    │    Burn)         │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────────┐ ┌──────────┐ ┌─────────────────┐
    │  PizzaPartyV2   │ │ Staking  │ │  ParlorManager  │
    │                 │ │ Contract │ │                 │
    │ • Daily game    │ │          │ │ • Parlor purchase│
    │ • Weekly jackpot│ │ • Stake  │ │ • Slice sending │
    │ • Pot splits    │ │ • Claim  │ │ • Fee distribution│
    │ • Charity       │ │ • Spin   │ │ • EIP-712 vouchers│
    │ • Toppings      │ │ • Tiers  │ │ • Burn mechanics│
    └────────┬────────┘ └─────┬────┘ └────────┬────────┘
             │                │               │
             │  notifyReward  │               │
             │  Amount()      │  enterDaily   │
             ├───────────────►│  WithSlice()  │
             │                │◄──────────────┤
             │   7% fees      │               │
             ├───────────────────────────────►│
             │                                │
             └────────────────────────────────┘
```

**PizzaPartyV2** is the hub:
- During settlement, it calls `notifyRewardAmount` on the staking contract to deliver the 10% staker share
- It sends 7% to the PizzaParlorManager for franchise fee distribution
- It directly transfers 3% to charity wallets
- The PizzaParlorManager calls `enterDailyWithSlice` on PizzaPartyV2 when a sponsored player claims their free entry

### Key Design Patterns

- **ReentrancyGuard** on all functions that transfer tokens
- **SafeERC20** for all token transfers (handles non-standard return values)
- **Checks-Effects-Interactions** pattern throughout (state updates before external calls)
- **Storage gap** (`uint256[N] private __gap`) reserved in all contracts for future upgrade safety
- **EIP-712 structured data** for slice voucher signatures (typed, domain-separated, replay-resistant)

---

## 14. Technical Infrastructure

### Frontend

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| UI Components | Radix UI (20+ component types) |
| Blockchain | Wagmi + Viem |
| Wallet Connection | Reown AppKit |
| Identity | Coinbase OnchainKit |
| Social Context | Farcaster MiniApp SDK |
| State Management | React Query (TanStack) |

### Backend

| Component | Technology |
|-----------|------------|
| Runtime | Next.js API Routes (serverless) |
| Database | PostgreSQL + Prisma ORM |
| Caching | Upstash Redis |
| Authentication | Farcaster JWT verification |
| Price Feeds | DexScreener API (primary) + GeckoTerminal (fallback) |
| Social Data | Neynar API (Farcaster profiles) |
| Hosting | Vercel (serverless deployment) |

### Database Schema

The off-chain database caches blockchain state for performance:

- **StakingPosition** — Maps Farcaster IDs to wallet addresses for staking lookups
- **Staker** — Cached on-chain staker data (tier, amounts, profile info) for fast leaderboard loading
- **ParlorLifetimeClaimed** — Persistent lifetime earnings tracking for parlor owners
- **SliceSend** — Anti-abuse tracking for free slice distribution (IP hashing, fraud flags)

### Automated Settlement

Five cron jobs manage the protocol's daily operations:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Settlement | 12:00 PM PST | Settle game, distribute pot, allocate fees, update price data |
| Weekly Settlement | Monday 12:02 PM PST | Settle weekly jackpot (offset to avoid RPC conflicts) |
| Daily Reminder | 11:50 AM PST | Push notification: game settling soon |
| Toppings Reminder | Sunday 11:50 AM PST | Push notification: claim window opening |
| Leaderboard Update | 1:00 PM PST | Share daily results |

### Push Notifications

Push notifications are delivered through the Farcaster MiniApp notification system, with delivery tracking managed via Upstash Redis. Notifications alert users to game settlements, win results, weekly claim windows, and leaderboard updates.

---

## 15. Security Model

### Smart Contract Security

- **UUPS upgradeable proxy** — allows bug fixes without fund migration
- **ReentrancyGuard** — protects all token transfer functions against reentrancy attacks
- **SafeERC20** — prevents silent failures on non-standard token implementations
- **OpenZeppelin v5.x** — industry-standard, battle-tested library contracts
- **Owner-only admin functions** — privileged operations restricted to contract owner
- **Maximum caps** — hard limits on parlors (100), charities (20), entries per week (7), stake per wallet (10B)
- **Verified contracts** — all contract source code verified and readable on BaseScan

### Application Security

- **Farcaster JWT verification** — authenticates API requests against Farcaster identity
- **CRON_SECRET** — protects settlement endpoints from unauthorized triggering
- **Ban list system** — blocks abusive players from game participation (banned players are removed from games before settlement)
- **IP hash tracking** — privacy-preserving fraud detection on slice distribution
- **Input validation** — all API endpoints validate and sanitize inputs
- **EIP-712 structured signatures** — slice vouchers use typed, domain-separated signatures preventing replay attacks

### Anti-Abuse Measures

- Banned player detection and removal before settlement
- Parlor owners cannot slice themselves or other parlor owners
- One slice per day per sponsor (sending limit)
- Weekly slice caps based on parlor count
- Nonce-based voucher system prevents slice reuse
- IP hash comparison between slice sender and claimer for fraud detection
- Flagging system for suspicious slice activity

---

## 16. Engagement Loops & Retention Design

Pizza Party is designed around multiple interlocking engagement loops that give players reasons to return daily, weekly, and long-term.

### Daily Loop
**Enter game → Win or lose → Come back tomorrow**
- Low entry cost (~$1) reduces friction
- 8 winners per game creates meaningful win probability
- Daily reset creates urgency and habit formation

### Weekly Loop
**Earn toppings all week → Claim Sunday → Draw Monday**
- Toppings accumulate from multiple sources (play, streaks, referrals, holdings, staking)
- 24-hour claim window creates time-bound engagement
- 10 winners drawn weekly adds a second layer of reward anticipation

### Staking Loop
**Stake → Earn daily → Spin → Claim or restake → Tier up**
- Daily rewards accumulate automatically
- Spin the Pie adds excitement to every claim
- Restaking compounds position and maintains lock bonus
- Tier progression rewards increasing commitment

### Sponsorship Loop
**Buy parlor → Slice players → Share winnings → Earn fees**
- Parlor purchase creates investment in the ecosystem
- Slicing others creates social connections and viral distribution
- Win-sharing aligns sponsor and player incentives
- Franchise fees provide passive income even without sponsored wins

### Streak Loop
**Play 7 consecutive days → Earn 3 bonus toppings**
- Streak bonus requires sustained daily engagement
- Missing a day resets the streak, creating behavioral urgency
- 3 bonus toppings represent meaningful weekly jackpot weight

---

## 17. Deflationary Mechanics

$PIZZA is structurally deflationary through multiple mechanisms:

### Parlor Burns
50% of every parlor purchase price is permanently burned via the token's `burn` function. With 100 parlors available at ~$50 each, the parlor system alone removes significant tokens from circulation as parlors sell.

### No Minting
The token contract contains no minting functionality. The 100 billion supply minted at deployment is the absolute maximum that will ever exist. Every burn permanently reduces total supply.

### Long-Term Sustainability
As the ecosystem grows and more parlors are purchased, the circulating supply decreases while demand for game entry, staking, and sponsorship increases — creating natural price discovery pressure.

---

## 18. Roadmap

### Completed

- $PIZZA token deployment on Base (100B fixed supply)
- Initial DEX liquidity provisioning
- PizzaPartyV2 daily game (live, running daily)
- Weekly jackpot system with topping mechanics
- Staking system with 4 tiers and 2 position types
- Spin the Pie reward multiplier
- Pizza Parlor sponsorship system with EIP-712 vouchers
- Charitable allocation to 9 veteran-support organizations
- EIP-2612 permit support for single-transaction entries
- Farcaster MiniApp integration
- Push notification system
- Leaderboard system (daily, weekly, lifetime, staker rankings)
- Referral system with on-chain tracking
- Ban list and anti-abuse systems
- Automated settlement with multi-source price feeds

### In Development

- Enhanced analytics dashboard
- Mobile experience optimization
- Additional game modes and mechanics
- Expanded partnership integrations

### Future Considerations

- Cross-chain expansion beyond Base
- Governance mechanisms for community decision-making
- Ecosystem grants program for third-party builders
- Additional charity categories and community-selected charities
- Tournament and competition modes

Timelines are indicative and subject to change based on community feedback and development priorities.

---

## 19. Risks & Disclaimers

Participation in the Pizza Party ecosystem involves risks including:

- **Smart contract risk:** Despite careful development and the use of battle-tested OpenZeppelin libraries, bugs may exist in the smart contracts
- **Network risk:** Base network congestion, outages, or reorganizations may affect game settlement or reward distribution
- **Market risk:** $PIZZA value may fluctuate significantly; past performance does not predict future results
- **Third-party risk:** The protocol depends on external infrastructure including RPCs, price oracles (DexScreener, GeckoTerminal), and the Farcaster network
- **Regulatory risk:** Cryptocurrency regulations continue to evolve across jurisdictions
- **Upgrade risk:** While UUPS upgradeability allows bug fixes, it also means the contract owner can modify contract logic
- **Oracle risk:** Price feed failures could affect entry cost calculations and settlement values (mitigated by multi-source fallback and retry logic)

**$PIZZA is a utility token intended for use within supported on-chain applications. It does not represent an investment contract, security, or ownership interest in any entity.**

- Token value may decrease to zero
- Staking rewards are not guaranteed and depend on ecosystem activity
- Nothing in this document constitutes financial, legal, or investment advice
- Users should conduct their own research before participating
- Never stake or spend more than you can afford to lose

---

## 20. Contract Addresses & Links

### Verified Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| $PIZZA Token | [`0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07`](https://basescan.org/token/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07) |
| PizzaPartyV2 (Proxy) | [`0xA1C31c3eF1448351da0b1D430148660982B6f3dD`](https://basescan.org/address/0xA1C31c3eF1448351da0b1D430148660982B6f3dD) |
| PizzaStakingV1 (Proxy) | [`0xCbAf5bACe5419710C3852653d3DdEB831d7415be`](https://basescan.org/address/0xCbAf5bACe5419710C3852653d3DdEB831d7415be) |
| PizzaParlorManager (Proxy) | [`0x7acfaa1dadd836404a8d90b49581758c4fdc889b`](https://basescan.org/address/0x7acfaa1dadd836404a8d90b49581758c4fdc889b) |

### Application Links

| Resource | URL |
|----------|-----|
| Web App | [pizza-party-game.vmfcoin.com](https://pizza-party-game.vmfcoin.com/) |
| Farcaster MiniApp | [Pizza Party on Farcaster](https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party) |
| Base App Token Page | [PIZZA on Base](https://base.app/coin/base-mainnet/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07) |
| GitHub | [github.com/VMFCoin/-PizzaToken](https://github.com/VMFCoin/-PizzaToken) |

---

*This whitepaper reflects the current state of the Pizza Party ecosystem as of March 2026 and may be updated as the protocol evolves.*
