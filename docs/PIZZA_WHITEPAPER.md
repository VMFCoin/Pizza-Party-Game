# $PIZZA Token Whitepaper

**Token Address (Base):**
`0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07`

**Version:** 2.0
**Last Updated:** January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Purpose of $PIZZA](#2-purpose-of-pizza)
3. [Token Utility](#3-token-utility)
4. [Supply & Economics](#4-supply--economics)
5. [Token Distribution](#5-token-distribution)
6. [PizzaParty: Daily Game](#6-pizzaparty-daily-game)
7. [Staking System](#7-staking-system)
8. [Spin the Pie: Reward Multiplier](#8-spin-the-pie-reward-multiplier)
9. [Weekly Jackpot](#9-weekly-jackpot)
10. [Pizza Parlors](#10-pizza-parlors)
11. [Charitable Allocation](#11-charitable-allocation)
12. [Smart Contract Architecture](#12-smart-contract-architecture)
13. [Security & Transparency](#13-security--transparency)
14. [Risks](#14-risks)
15. [Roadmap](#15-roadmap)
16. [Disclaimer](#16-disclaimer)
17. [Links](#17-links)

---

## 1. Overview

$PIZZA is a utility token deployed on the Base network, designed as a participation and reward token that powers an ecosystem of on-chain applications. The token emphasizes transparent supply mechanics, verifiable on-chain execution, and genuine utility over speculative design.

The $PIZZA ecosystem centers around PizzaParty, a daily participation game featuring automated reward distributions, a comprehensive staking system with tiered benefits, and the innovative "Spin the Pie" reward multiplier mechanic.

---

## 2. Purpose of $PIZZA

$PIZZA serves as:

- **A participation and reward token** for daily and weekly game mechanics
- **A staking asset** that generates passive yield and enhanced rewards
- **A distribution mechanism** for automated, transparent reward payouts
- **A charitable vehicle** directing a portion of all activity to veteran-support organizations

The token does not represent equity, ownership, or governance rights in any organization.

---

## 3. Token Utility

### Participation Utility
$PIZZA functions as the entry and reward asset for PizzaParty and future ecosystem applications. Users spend $PIZZA to participate and earn $PIZZA through various reward mechanisms.

### Staking Utility
Holders can stake $PIZZA to earn:
- A share of daily game rewards (10% of daily pot)
- Tier-based yield bonuses
- Lock bonuses for committed positions
- Annual percentage yield on locked stakes (20% APY)
- Additional weekly jackpot entries (toppings)

### Incentive Alignment
The tiered staking system rewards long-term holders with progressively better benefits, aligning participant interests with ecosystem health.

### Charitable Allocation
3% of all daily pot distributions are programmatically directed to registered veteran-support charities, with all transfers executed transparently on-chain.

---

## 4. Supply & Economics

| Attribute | Value |
|-----------|-------|
| Token Name | $Pizza |
| Symbol | PIZZA |
| Network | Base |
| Decimals | 18 |
| Total Supply | 100,000,000,000 (100 Billion) |

The total supply was minted at deployment. The contract contains no minting functionality, ensuring a fixed supply with zero inflation risk.

---

## 5. Token Distribution

| Allocation | Amount | Percentage | Purpose |
|------------|--------|------------|---------|
| Liquidity Pool | 10,000,000,000 | 10% | DEX trading liquidity |
| Treasury | 40,000,000,000 | 40% | Ecosystem development and operations |
| Staking Rewards | 35,000,000,000 | 35% | Staker bonus payouts and APY |
| Marketing | 10,000,000,000 | 10% | Growth and adoption initiatives |
| Team | 5,000,000,000 | 5% | Core team allocation |

The Staking Rewards wallet is completely separate from Treasury and exclusively funds staker bonuses, spin multiplier payouts, and APY distributions.

---

## 6. PizzaParty: Daily Game

PizzaParty is the flagship application of the $PIZZA ecosystem—a daily participation game where players compete for a share of the daily pot.

### How It Works

1. **Entry**: Players spend $PIZZA to enter the daily game (~$1 worth)
2. **Daily Reset**: Games reset at 12:00 PM PST (20:00 UTC)
3. **Winner Selection**: 8 winners are selected each day
4. **Reward Distribution**: The pot is automatically distributed via smart contract

### Daily Pot Distribution

| Recipient | Percentage | Description |
|-----------|------------|-------------|
| Winners | 80% | Split equally among 8 daily winners |
| Stakers | 10% | Distributed equally to all active stakers |
| Parlor Owners | 7% | Rewards for Pizza Parlor operators |
| Charities | 3% | Directed to veteran-support organizations |

### Participation Limits
- Maximum 7 entries per wallet per week
- Entry cost is approximately $1 worth of PIZZA (dynamic based on token price)

---

## 7. Staking System

The $PIZZA staking system allows holders to earn passive rewards from daily game activity while receiving tiered bonuses based on their commitment level.

### Staking Tiers

| Tier | Minimum Stake | Yield Bonus | Weekly Toppings |
|------|---------------|-------------|-----------------|
| Slice Runner | 0 - 499,999,999 PIZZA | +1.5% | +0 |
| Oven Operator | 500,000,000 PIZZA | +3% | +1 |
| Pie Boss | 2,000,000,000 PIZZA | +7% | +3 |
| Pizza Tycoon | 5,000,000,000 PIZZA | +15% | +5 |

Tiers are determined by total staked amount across all positions.

### Position Types

Users may hold up to two independent staking positions:

**Flexible Position**
- No lock period
- Withdraw anytime without penalty
- Base rewards + tier bonus only

**Locked Position**
- 7-day lock period
- +5% yield bonus on all rewards
- 20% annual APY on staked principal
- Early withdrawal incurs 15% penalty

### Staking Parameters

| Parameter | Value |
|-----------|-------|
| Minimum Stake | ~$1 USD worth of PIZZA (dynamic) |
| Maximum Stake | 10,000,000,000 PIZZA per wallet (10% of supply) |
| Lock Duration | 7 days |
| Lock Bonus | +5% |
| Early Unstake Penalty | 15% |
| Locked Position APY | 20% annual |

### Early Staker Boost

For the first 60 days following staking launch, all stakers receive an additional +30% bonus on all rewards, regardless of tier or lock status.

### Reward Calculation

The staking system uses an **equal distribution model**—all stakers receive the same base reward regardless of stake size, promoting fairness and accessibility.

**Step 1: Base Reward**
```
Base Reward = (10% of Daily Pot) / Number of Active Stakers
```

**Step 2: Apply Bonuses (Additive)**
```
Total Bonus % = Tier Bonus + Lock Bonus + Early Staker Bonus
Bonus Amount = Base Reward x Total Bonus %
```

**Step 3: Add APY (Locked Positions Only)**
```
APY Reward = (Staked Amount x 20% x Days Elapsed) / 365
```

**Step 4: Final Reward**
```
Final Reward = Base Reward + Bonus Amount + APY Reward
```

**Example Calculation:**

A Pizza Tycoon with a 7-day locked position during the early boost period:
- Daily pot: 10,000,000 PIZZA
- Staking allocation (10%): 1,000,000 PIZZA
- Active stakers: 100
- Base reward: 10,000 PIZZA
- Tier bonus (+15%): 1,500 PIZZA
- Lock bonus (+5%): 500 PIZZA
- Early boost (+30%): 3,000 PIZZA
- **Total daily reward: 15,000 PIZZA** (plus APY on locked principal)

---

## 8. Spin the Pie: Reward Multiplier

Spin the Pie is an interactive reward mechanic that allows stakers to multiply their daily rewards through a chance-based spin.

### How It Works

1. **Record Spin**: Staker initiates their daily spin (one per day)
2. **Spin Animation**: The wheel spins to reveal the outcome
3. **Claim Reward**: Staker claims their multiplied reward

### Spin Outcomes

| Outcome | Probability | Multiplier | Effect |
|---------|-------------|------------|--------|
| Regular Slice | 73% | 1.0x | Standard payout |
| Loaded Slice | 20% | 1.1x | +10% bonus |
| Hot Out the Oven | 5% | 1.5x | +50% bonus |
| JACKPOT | 2% | 4.0x | 4x payout + 10M PIZZA fixed bonus |

### Jackpot Mechanics

- Only one jackpot can be won per game day across all stakers
- If a second jackpot is spun on the same day, it automatically downgrades to "Hot Out the Oven" (1.5x)
- Jackpot winners receive a fixed bonus of 10,000,000 PIZZA in addition to the 4x multiplier

### Spin Multiplier Application

The spin multiplier is applied to the base reward BEFORE tier and lock bonuses are calculated:

```
Spun Reward = Base Reward x Spin Multiplier
Final Reward = Spun Reward + (Spun Reward x Total Bonus %)
```

### Bonus Pool

Payouts exceeding 100% (the multiplier bonus portion) are funded by the Staking Rewards Wallet, which must have sufficient PIZZA approved for the staking contract to spend.

---

## 9. Weekly Jackpot

The Weekly Jackpot provides an additional reward opportunity based on accumulated "toppings" (lottery entries).

### Earning Toppings

| Action | Toppings Earned | Weekly Limit |
|--------|-----------------|--------------|
| Daily game entry | +1 per entry | 7 |
| 7-day play streak | +3 bonus | 1 |
| Referral reward | +2 per referral | 3 |
| Holdings bonus | +1 per $10 held | 5 |
| Staking tier bonus | Varies by tier | See tier table |

### Staking Tier Topping Bonuses

| Tier | Weekly Bonus Toppings |
|------|----------------------|
| Slice Runner | +0 |
| Oven Operator | +1 |
| Pie Boss | +3 |
| Pizza Tycoon | +5 |

### Claim Window

- **Opens**: Sunday 12:00 PM PST
- **Closes**: Monday 12:00 PM PST
- Players must claim their toppings during this 24-hour window

### Winner Selection

- 10 winners selected weekly (or fewer if fewer participants)
- Selection is **weighted by topping count**—more toppings means higher odds
- Jackpot is split equally among all winners

### Jackpot Calculation

```
Weekly Jackpot = (Total Claimed Toppings x Topping Unit Value) + Treasury Bonus
```

The topping unit value adjusts dynamically based on $PIZZA price to maintain consistent dollar-equivalent value.

---

## 10. Pizza Parlors

Pizza Parlors are virtual establishments that allow holders to sponsor other players and earn a share of their winnings.

### Sponsorship Mechanics

- Parlor owners can "slice" (sponsor) other players
- Sponsored players receive free game entries
- If a sponsored player wins, the reward is split 50/50 between player and sponsor
- Each sponsor can slice a player once

### Parlor Owner Rewards

Parlor owners receive a portion of the 7% parlor allocation from each daily pot, distributed based on parlor ownership and activity.

### Parlor Purchase Fee Distribution

When purchasing a parlor:
- 50% is burned (removed from circulation)
- 30% goes to Treasury
- 20% goes to Operations/Marketing

### Franchise Fee Distribution (from daily game)

- 30% to Treasury
- 50% to Parlor Owners (distributed equally)
- 20% to Operations

---

## 11. Charitable Allocation

3% of every daily pot is automatically directed to registered veteran-support charities.

### On-Chain Execution

- All charitable transfers execute via smart contract
- No intermediaries or manual processes
- Fully transparent and auditable on BaseScan
- Charity wallets are registered on-chain

This mechanism ensures consistent, trustless support for charitable causes without reliance on discretionary decisions.

### Registered Veteran Charity Wallets (On-Chain)

These charity wallets are the current on-chain defaults used by `PizzaPartyV2Upgradeable` when `charityWallets` has not been explicitly set by the owner:

| Charity | Wallet Address (Base) |
|--------|------------------------|
| Patriots Promise | `0x6456879a5073038b0E57ea8E498Cb0240e949fC3` |
| Victory For Veterans | `0x700B53ff9a58Ee257F9A2EFda3a373D391028007` |
| Holy Family Village | `0xB697C8b4bCaE454d9dee1E83f73327D7a63600a1` |
| Camp Cowboy | `0x5951A4160F73b8798D68e7177dF8af6a7902e725` |
| Veterans In Need Project | `0xfB0EF51792c36Ae1fE6636603be199788819b67D` |
| Honor HER Foundation | `0x10F01632DC709F7fA413A140739D8843b06235A1` |
| Magicians On Mission | `0x0730d4dc43cf10A3Cd986FEE17f30cB0E75410e0` |
| April Forces | `0x043820C97771c570d830bB0e189778Fdef5E6EEb` |
| Little Patriots Embraced | `0x097701F99CC7b0Ff816C2355faC104ADdC6e27B9` |

Owner controls:
- The owner can update this list on-chain using `setCharityWallets(...)` (or add/remove via `addCharityWallet(...)` / `removeCharityWallet(...)`).

---

## 12. Smart Contract Architecture

The $PIZZA ecosystem uses an upgradeable proxy architecture (UUPS pattern) allowing logic improvements while preserving user token balances and staking positions.

### Core Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| PIZZA Token | `0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07` | ERC-20 token with EIP-2612 permit |
| PizzaPartyV2 | `0xA1C31c3eF1448351da0b1D430148660982B6f3dD` | Daily game logic and pot distribution |
| PizzaStakingV1 | `0xCbAf5bACe5419710C3852653d3DdEB831d7415be` | Staking positions, rewards, and Spin the Pie |
| PizzaParlorManager | `0x7acfaa1dadd836404a8d90b49581758c4fdc889b` | Parlor ownership and sponsorship |

### Architecture Principles

- Fixed token supply (no minting capability)
- Publicly verifiable contracts on BaseScan
- Minimal privileged roles
- Upgradeability limited to logic, not supply
- Clear ownership boundaries
- EIP-2612 permit support for gasless approvals

---

## 13. Security & Transparency

The $PIZZA ecosystem prioritizes:

- **Minimal privileged roles**: Admin functions limited to operational necessities
- **On-chain execution**: All critical logic executes transparently on-chain
- **Public auditability**: All contracts verified and readable on BaseScan
- **No hidden mechanics**: Reward calculations and distributions are deterministic and verifiable
- **ReentrancyGuard**: Protection against reentrancy attacks on all token transfers
- **SafeERC20**: Safe token transfer patterns throughout

Users are encouraged to independently review contract code and monitor on-chain activity.

---

## 14. Risks

Participation in the $PIZZA ecosystem involves risks including:

- **Smart contract vulnerabilities**: Despite careful development, bugs may exist
- **Network issues**: Base network congestion or outages may affect functionality
- **Market volatility**: $PIZZA value may fluctuate significantly
- **Third-party dependencies**: Reliance on external infrastructure (RPCs, oracles)
- **Regulatory uncertainty**: Cryptocurrency regulations continue to evolve

Participation is voluntary and at the user's own risk. Never stake or spend more than you can afford to lose.

---

## 15. Roadmap

### Completed

- Token deployment on Base (100B supply)
- Initial liquidity provisioning
- PizzaParty daily game launch
- Staking system with tiered rewards
- Spin the Pie reward multiplier
- Weekly jackpot system
- Pizza Parlor sponsorship mechanics
- Charitable allocation system
- EIP-2612 permit support for single-transaction entries

### In Development

- Enhanced analytics dashboard
- Mobile optimization improvements
- Additional participation-based utilities
- Expanded partnership integrations

### Future Considerations

- Cross-chain expansion
- Additional game modes
- Governance mechanisms
- Ecosystem grants program

Timelines are indicative and subject to change based on community feedback and development priorities.

---

## 16. Disclaimer

$PIZZA is a utility token intended for use within supported on-chain applications. It does not represent an investment contract, security, or ownership interest in any entity.

- Past performance does not guarantee future results
- Token value may decrease to zero
- Staking rewards are not guaranteed and depend on ecosystem activity
- Nothing in this document constitutes financial, legal, or investment advice
- Users should conduct their own research before participating

---

## 17. Links

**Token Contract (Base):**
https://basescan.org/token/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07

**Primary Website:**
https://pizza-party-game.vmfcoin.com/

**Farcaster Mini App:**
https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party

**Base App Token Page:**
https://base.app/coin/base-mainnet/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07

**GitHub:**
https://github.com/VMFCoin/-PizzaToken

---

*This whitepaper reflects the current state of the $PIZZA ecosystem and may be updated as the protocol evolves.*
