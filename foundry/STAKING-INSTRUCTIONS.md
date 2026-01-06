# 🍕 PIZZA PARTY STAKING - BUILD INSTRUCTIONS

## OVERVIEW

You are helping build a staking system for Pizza Party, a crypto lottery game on Base blockchain. This document contains everything you need to implement the staking contracts.

---

## PROJECT CONTEXT

### What is Pizza Party?
- A daily lottery game where players buy entries with $PIZZA token
- Players earn "toppings" (bonus entries) through gameplay
- Winners are selected via weighted random selection
- Already deployed and running with upgradeable proxy contracts

### What are we building?
A staking system called "Spin the Pie" that:
1. Lets users stake $PIZZA tokens to earn yield
2. Rewards stakers with a portion of daily lottery pot (4%)
3. Gives stakers bonus toppings and lottery weight based on tier
4. Includes a fun "spin the wheel" mechanic when claiming rewards

---

## EXISTING CONTRACTS (Already Deployed)

These contracts already exist and use UUPS upgradeable proxy pattern:

1. **PizzaPartyV2Upgradeable.sol** - Main lottery game contract
2. **PizzaParlorManagerUpgradeable.sol** - Manages "parlor" referral system
3. **$PIZZA Token** - Current ERC20 token (will be replaced with new token)

All contracts use:
- OpenZeppelin Upgradeable contracts
- UUPS proxy pattern
- `onlyOwner` for admin functions
- SafeERC20 for token transfers

---

## NEW TOKEN INFORMATION

- **New $PIZZA token address:** TBD (will be set via admin function after Clanker launch)
- **Total Supply:** 10,000,000,000 (10 billion)
- **Decimals:** 18

### Token Distribution (handled by Clanker at launch):
| Allocation | Amount | Wallet |
|------------|--------|--------|
| Liquidity Pool | 1,000,000,000 (10%) | Clanker LP |
| Treasury | 4,000,000,000 (40%) | Treasury wallet |
| Staking Rewards | 3,500,000,000 (35%) | Staking wallet |
| Marketing | 1,000,000,000 (10%) | Marketing wallet |
| Team | 500,000,000 (5%) | Team wallet |

**IMPORTANT:** Treasury and Staking wallets are completely separate. Staking rewards come ONLY from the Staking wallet.

---

## DAILY POT DISTRIBUTION

When each daily game settles, the pot is split:

| Recipient | % | Source |
|-----------|---|--------|
| Winners | 90% | Daily pot |
| Stakers | 4% | Daily pot |
| Charity | 3% | Daily pot |
| Parlors | 3% | Daily pot |

**Note:** Charity receives their share directly from the daily pot settlement, not from any special wallet.

---

## CONTRACTS TO CREATE

### 1. PizzaStakingV1Upgradeable.sol (NEW)
Full staking contract with tiers, lock periods, and spin-the-wheel claim mechanic.

### 2. IPizzaStaking.sol (NEW)
Interface for cross-contract calls.

### 3. PizzaPartyV2 Modifications (UPGRADE)
Changes to integrate staking - send 4% of daily pot to stakers.

### 4. PizzaParlorManager Modifications (UPGRADE)
Token address update support.

---

## STAKING SYSTEM SPECIFICATIONS

### Tiers
| Tier | ID | Min Stake | Yield Boost | Topping Bonus | Weekly Weight |
|------|----|-----------|-------------|---------------|---------------|
| Slice Runner | 0 | 0 | 1.0x | +0/week | 1.0x |
| Oven Operator | 1 | 50,000,000 | 1.5x | +1/week | 1.25x |
| Pie Boss | 2 | 200,000,000 | 2.0x | +3/week | 1.5x |
| Pizza Tycoon | 3 | 500,000,000 | 3.0x | +5/week | 2.0x |

### Lock Periods
| Type | Duration | Yield Multiplier | Early Exit Penalty |
|------|----------|------------------|-------------------|
| Flexible | 0 | 0.5x | None |
| Locked | 7 days | 1.5x | 15% of staked amount |

### Key Parameters
- **Minimum stake:** 100,000 PIZZA
- **Maximum stake per wallet:** 1,000,000,000 PIZZA (10% of supply)
- **Early staker boost:** +30% rewards for first 60 days
- **Stakers receive:** 4% of daily lottery pot
- **Single position per wallet:** Users can only have one stake position

### Spin the Pie (Claim Mechanic)
| Outcome | Chance | Multiplier |
|---------|--------|------------|
| Regular Slice | 73% | 100% |
| Loaded Slice | 20% | 110% |
| Hot Out the Oven | 5% | 125% |
| JACKPOT | 2% | 200% |

- Spin is **disabled by default** (spinEnabled = false)
- When disabled, claims pay out at 100%
- Owner can enable when UI is ready
- Extra rewards (above 100%) come from bonus pool
- Bonus pool funded by: early unstake penalties, can be topped up from Staking wallet

---

## TECHNICAL REQUIREMENTS

### Must Use:
- Solidity ^0.8.20
- OpenZeppelin Contracts Upgradeable v5.x
- UUPS Proxy Pattern
- SafeERC20 for all token transfers
- ReentrancyGuard on all external functions that transfer tokens

### Security Considerations:
- All admin functions must be `onlyOwner`
- Use `nonReentrant` modifier on stake/unstake/claim
- Validate all inputs (no zero addresses, amounts within bounds)
- Use SafeMath implicitly (Solidity 0.8+)
- Check for sufficient balance before transfers

### Gas Optimization:
- Pack structs efficiently
- Use uint256 for most values (cheaper than smaller uints in storage)
- Cache storage reads in memory when used multiple times
- Use unchecked blocks where overflow is impossible

---

## INTEGRATION FLOW

### How contracts interact:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER                                     │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│  PizzaStaking       │              │  PizzaPartyV2       │
│  - stake()          │◄────────────►│  - enterDaily()     │
│  - unstake()        │   queries    │  - claimToppings()  │
│  - claim()          │   tier/bonus │  - _settleDailyGame │
│  - notifyReward()   │◄─────────────│    sends 4% to      │
└─────────────────────┘   4% of pot  │    staking contract │
          │                          └─────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      $PIZZA TOKEN                                │
└─────────────────────────────────────────────────────────────────┘
```

### Daily Settlement Flow:
1. PizzaPartyV2 settles daily game
2. Calculates 4% of pot for stakers
3. Transfers 4% to PizzaStakingV1Upgradeable
4. Calls `notifyRewardAmount(amount)` to update reward distribution

### Staker Claim Flow:
1. User calls `claim()` on staking contract
2. Contract calculates pending rewards (base + tier boost + lock boost + early boost)
3. If spinEnabled: random spin determines final multiplier
4. If multiplier > 100%: extra comes from bonus pool
5. Tokens transferred to user

---

## IMPORTANT IMPLEMENTATION NOTES

1. **Token address is TBD** - Use a state variable `address public pizzaToken` that can be set via admin function `adminSetPizzaToken(address _token)`

2. **All contracts must be upgradeable** - Follow UUPS pattern with `_authorizeUpgrade` function

3. **Match existing code style** - Look at existing PizzaPartyV2Upgradeable.sol for naming conventions and patterns

4. **Emit events** - Every state-changing function should emit an appropriate event

5. **NatSpec comments** - Include full documentation on all public/external functions

6. **Test considerations** - Design functions to be easily testable (view functions for state, etc.)

---

## DEPLOYMENT STEPS

1. Deploy PizzaStakingV1Upgradeable (proxy + implementation)
2. Upgrade PizzaPartyV2 with staking integration modifications
3. Upgrade PizzaParlorManager with new token support
4. Launch new $PIZZA on Clanker
5. Call `adminSetPizzaToken()` on all contracts with new address
6. Staking Wallet approves staking contract to spend rewards
7. Set `boostEndTime` for early staker boost (60 days from launch)
8. Enable staking
9. (Later) Enable Spin the Pie when UI is ready

---

## KEY PRIORITIES

1. **Security first** - don't skip checks
2. **Keep it simple** - avoid over-engineering
3. **Make it upgradeable** - we can fix issues later
4. **Document everything** - future devs need to understand this
