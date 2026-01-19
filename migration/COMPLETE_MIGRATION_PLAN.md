# COMPLETE MIGRATION PLAN - $PIZZA Token Switch

## DO NOT EXECUTE YET - PREPARATION ONLY

---

## Token Information

### NEW TOKEN
| Field | Value |
|-------|-------|
| **Address** | `0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07` |
| **Name** | Pizza |
| **Symbol** | Pizza |
| **Total Supply** | 100,000,000,000 (100 Billion) |
| **Decimals** | 18 |
| **Chain** | Base (Chain ID: 8453) |
| **Current Price** | ~$0.000001932 |
| **Market Cap** | ~$193,244 |
| **DEX** | Uniswap V4 (Base) |

### OLD TOKEN (Current)
| Field | Value |
|-------|-------|
| **Address** | `0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69` |
| **Total Supply** | 10,000,000 (10 Million) |

### CONTRACT OWNER
| Field | Value |
|-------|-------|
| **Owner Wallet** | `0x828F516b379A2532bB33a00d34125560BF4c1853` |
| **Type** | Current owner (unchanged) |

---

## CRITICAL: Verify Burn Function

**MUST VERIFY BEFORE MIGRATION:**

The PizzaParlorManager calls `IBurnable(token).burn(amount)` for 50% parlor burns.

```solidity
interface IBurnable {
    function burn(uint256 amount) external;
}
```

**Test Command:**
```bash
# Check if burn function exists
cast call 0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07 "burn(uint256)" 0 --rpc-url https://mainnet.base.org

# If it reverts with "execution reverted" - function exists but needs tokens
# If it reverts with "function not found" - NO BURN FUNCTION (PROBLEM!)
```

**Clanker tokens typically have burn.** Verify this before proceeding.

---

# PAGE-BY-PAGE BREAKDOWN

---

## 1. DAILY GAME PAGE

### Entry Fee Calculation
```
Target: $1 USD
Formula: 1 / pizzaPrice = PIZZA amount
Current Price: $0.000001932
Entry Fee: ~517,598 PIZZA ($1 worth)
```

### Current Bounds (MUST REMOVE)
```solidity
// Current - TOO RESTRICTIVE for 100B supply
MIN_ENTRY_FEE = 1e16;      // 0.01 PIZZA
MAX_ENTRY_FEE = 1000e18;   // 1000 PIZZA

// NEW - No artificial limits
MIN_ENTRY_FEE = 1;                    // 1 wei (effectively none)
MAX_ENTRY_FEE = type(uint256).max;    // Unlimited
```

### Fee Distribution Change
```
CURRENT:                    NEW:
├─ Players: 93%       →    ├─ Players: 80% (8 winners = 10% each)
├─ Charity: 3%        →    ├─ Charity: 3%
├─ Owner: 3%          →    ├─ Owner: 7%
└─ Staking: 1%        →    └─ Staking: 10%
```

### Display
Entry fee shows correctly: "517.60K PIZZA to play" (formatPizza handles large numbers)

---

## 2. WEEKLY GAME PAGE

### No Changes Required
- Topping value = $0.10 USD worth of PIZZA (dynamic)
- At current price: 1 topping = ~51,760 PIZZA
- Jackpot = (total toppings × topping value) + treasury bonus
- All calculations are USD-based, auto-adjust

---

## 3. LEADERBOARD & LIFETIME STATS

### Historical Data Conversion

**Problem:** Old stats stored in old token amounts. Need to show equivalent in new supply.

**Multiplier:** 10,000x (100B / 10M = 10,000)

```typescript
// Add to LeaderboardPage.tsx
const SUPPLY_MULTIPLIER = 10000n;

// When displaying historical PIZZA won:
const adjustedPizzaWon = stats.totalPizzaWon * SUPPLY_MULTIPLIER;
```

**Example:**
- Old: Won 100 PIZZA → Display: 1,000,000 PIZZA (equivalent value)

---

## 4. PARLOR PAGE

### Purchase Price
```
Target: $50 USD
Formula: 50 / pizzaPrice = PIZZA amount
Current Price: $0.000001932
Parlor Cost: ~25,879,917 PIZZA ($50 worth)
```

### Current Bounds (MUST REMOVE)
```solidity
// Current - TOO RESTRICTIVE
MIN_PARLOR_PRICE = 500e18;      // 500 PIZZA
MAX_PARLOR_PRICE = 500_000e18;  // 500,000 PIZZA

// NEW - No artificial limits
MIN_PARLOR_PRICE = 1;                   // 1 wei
MAX_PARLOR_PRICE = type(uint256).max;   // Unlimited
```

### Burn & Distribution (NO CHANGE)
```
Purchase Amount Split:
├─ 50% BURNED (calls token.burn())
├─ 30% Treasury
└─ 20% Operations
```

---

## 5. STAKING PAGE

### Tier Thresholds
```
                    CURRENT         →    NEW (100B)
Slice Runner:       0               →    0
Oven Operator:      50,000          →    500,000,000 (500M)
Pie Boss:           200,000         →    2,000,000,000 (2B)
Pizza Tycoon:       500,000         →    5,000,000,000 (5B)
```

**At current price ($0.000001932):**
| Tier | PIZZA Required | USD Value |
|------|----------------|-----------|
| Oven Operator | 500M | ~$966 |
| Pie Boss | 2B | ~$3,864 |
| Pizza Tycoon | 5B | ~$9,660 |

### Staking Limits
```solidity
// Current
MIN_STAKE_FALLBACK = 100 * 1e18;        // 100 PIZZA
MAX_STAKE = 1_000_000 * 1e18;           // 1M PIZZA

// NEW
// MIN_STAKE_FALLBACK - REMOVE, use dynamic multi-DEX lookup
MAX_STAKE = 100_000_000_000 * 1e18;     // 100B (total supply, no cap)
```

### Min Stake Logic (NEW)
```typescript
async function getMinStakeAmount(): Promise<bigint> {
  // 1. Try DexScreener
  const dexPrice = await fetchDexScreener('0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07');
  if (dexPrice) return BigInt(Math.ceil(1 / dexPrice * 1e18));

  // 2. Try GeckoTerminal
  const geckoPrice = await fetchGeckoTerminal('0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07');
  if (geckoPrice) return BigInt(Math.ceil(1 / geckoPrice * 1e18));

  // 3. Use last entry amount from contract
  const lastEntry = await contract.getLastEntryAmount();
  if (lastEntry > 0n) return lastEntry;

  // 4. Ultimate fallback
  return 1000n * 10n**18n;
}
```

### Jackpot Spin Bonus (NEW)
```solidity
// Add fixed 10B PIZZA bonus on jackpot spin
uint256 public constant JACKPOT_FIXED_BONUS = 10_000_000_000 * 1e18;

// In spin logic:
if (outcome == SpinOutcome.Jackpot) {
    reward = (baseReward * 40000) / 10000;  // 4x multiplier
    reward += JACKPOT_FIXED_BONUS;          // + 10B PIZZA
}
```

**At current price:** 10B PIZZA = ~$19,320 bonus!

### Early Unstake Penalty Redirect (NEW)
```
CURRENT: 15% penalty → bonusPool
NEW:     15% penalty → parlor owners (split evenly)
```

---

## 6. PRICE FEEDS

### DexScreener URL Update
```typescript
// OLD
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens/0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69'

// NEW
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07'
```

**Current price feed working:** ✅ (verified via DexScreener API)

---

# ALL CHANGES SUMMARY

## Smart Contract Changes

### PizzaPartyV2Upgradeable.sol
| Change | Current | New |
|--------|---------|-----|
| Token Address | `adminSetPizzaToken()` call needed | `0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07` |
| MIN_ENTRY_FEE | `1e16` | `1` |
| MAX_ENTRY_FEE | `1000e18` | `type(uint256).max` |
| PLAYERS_POOL_BPS | `9300` | `8000` |
| MAX_OWNER_FEE_BPS | `300` | `700` |
| STAKING_POOL_BPS | `100` | `1000` |
| NEW: lastEntryAmount | - | Storage for fallback |
| NEW: getLastEntryAmount() | - | View function |

### PizzaStakingV1Upgradeable.sol
| Change | Current | New |
|--------|---------|-----|
| Token Address | `adminSetPizzaToken()` call needed | `0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07` |
| MIN_STAKE_FALLBACK | `100 * 1e18` | REMOVE (use dynamic) |
| MAX_STAKE | `1_000_000 * 1e18` | `100_000_000_000 * 1e18` |
| TIER1_THRESHOLD | `50_000 * 1e18` | `500_000_000 * 1e18` |
| TIER2_THRESHOLD | `200_000 * 1e18` | `2_000_000_000 * 1e18` |
| TIER3_THRESHOLD | `500_000 * 1e18` | `5_000_000_000 * 1e18` |
| NEW: JACKPOT_FIXED_BONUS | - | `10_000_000_000 * 1e18` |
| Penalty destination | `bonusPool` | `parlorManager` |

### PizzaParlorManagerUpgradeable.sol
| Change | Current | New |
|--------|---------|-----|
| Token Address | Reads from PizzaParty | Needs `adminSetPizzaToken()` added |
| MIN_PARLOR_PRICE | `500e18` | `1` |
| MAX_PARLOR_PRICE | `500_000e18` | `type(uint256).max` |
| NEW: receivePenaltyForOwners() | - | Accept penalty from staking |
| NEW: pendingOwnerPenalties | - | Storage for penalties |

## Frontend Changes

### Files to Update with New Token Address
1. `app/lib/constants/index.tsx` - PIZZA_TOKEN_ADDRESS
2. `app/api/cron/settle-game/route.ts` - Price feed URL
3. `app/api/cron/settle-weekly/route.ts` - Price feed URL
4. `app/api/price/route.ts` - DexScreener URL
5. `app/components/game/index.tsx` - Buy link

### StakingPage.tsx
| Change | Current | New |
|--------|---------|-----|
| Tier 1 minStake | `50_000` | `500_000_000` |
| Tier 2 minStake | `200_000` | `2_000_000_000` |
| Tier 3 minStake | `500_000` | `5_000_000_000` |
| MIN_STAKE_FALLBACK | `100` | REMOVE |
| _MAX_STAKE | `1_000_000` | `100_000_000_000` |
| Jackpot display | - | "+10B PIZZA BONUS!" |

### LeaderboardPage.tsx
| Change | Description |
|--------|-------------|
| NEW | SUPPLY_MULTIPLIER = 10000n |
| NEW | Multiply totalPizzaWon for historical display |

### useGamePageData.tsx
| Change | Description |
|--------|-------------|
| NEW | getMinStakeAmount() with multi-DEX fallback |
| NEW | Last entry amount fallback from contract |

---

# EXECUTION ORDER

## Phase 1: Verify Prerequisites
- [ ] Verify burn() function on new token
- [ ] Verify owner wallet has access to all contracts
- [ ] Fund treasury wallet with new PIZZA
- [ ] Fund staking rewards wallet with new PIZZA
- [ ] Fund jackpot bonus pool (need 10B PIZZA per jackpot win)

## Phase 2: Smart Contract Updates
```bash
# Owner wallet: 0x828F516b379A2532bB33a00d34125560BF4c1853
# New token: 0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07

# 1. Update PizzaPartyV2 token
cast send 0xA1C31c3eF1448351da0b1D430148660982B6f3dD \
  "adminSetPizzaToken(address)" \
  0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07 \
  --private-key $PK --rpc-url https://mainnet.base.org

# 2. Update PizzaStaking token
cast send 0xCbAf5bACe5419710C3852653d3DdEB831d7415be \
  "adminSetPizzaToken(address)" \
  0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07 \
  --private-key $PK --rpc-url https://mainnet.base.org

# 3. PizzaParlorManager - NEEDS CONTRACT UPGRADE
# (Currently no adminSetPizzaToken function)
```

## Phase 3: Deploy Updated Contract Implementations
1. Deploy new PizzaPartyV2 implementation (new fee distribution, no bounds)
2. Deploy new PizzaStaking implementation (new tiers, jackpot bonus, penalty redirect)
3. Deploy new PizzaParlorManager implementation (no bounds, penalty receiving)
4. Upgrade all proxies to new implementations

## Phase 4: Code Updates
```bash
# Run token address swap
./migration/token-migration.sh --execute 0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07

# Run supply constant updates
./migration/supply-migration.sh --execute
```

## Phase 5: Frontend Deploy
Deploy updated Next.js application

## Phase 6: Verification
```bash
# Verify token addresses
cast call 0xA1C31c3eF1448351da0b1D430148660982B6f3dD "pizzaToken()(address)"
cast call 0xCbAf5bACe5419710C3852653d3DdEB831d7415be "pizzaToken()(address)"
cast call 0x7Acfaa1DaDd836404a8d90b49581758c4FDC889b "pizzaToken()(address)"

# Verify price feed
curl "https://api.dexscreener.com/latest/dex/tokens/0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07"
```

---

# WALLET FUNDING REQUIREMENTS

| Wallet | Purpose | Needs New PIZZA |
|--------|---------|-----------------|
| Treasury | Free slices, weekly bonus | YES |
| Staking Rewards | Reward distributions | YES |
| Jackpot Pool | 10B per jackpot win | YES |
| Contract Owner | Gas for txs | ETH only |

---

# STAKING RESET BEHAVIOR

**IMPORTANT:** After migration, all existing stakers will be treated as first-time stakers:

- Old $PIZZA token stakes are NOT transferable to the new token
- All users' staking positions reset to 0 (flexibleAmount, lockedAmount)
- Lifetime staked and lifetime rewards reset to 0
- Users must stake $1 worth of NEW $PIZZA to begin staking again
- The 5 whitelisted FIDs can access staking during migration to re-stake

This is expected behavior since the smart contract's `pizzaToken` address changes, and the new token has no existing stake data.

---

# ROLLBACK PLAN

If issues occur:
1. Call `adminSetPizzaToken()` with OLD address on all contracts
2. Restore code from `migration/backups/`
3. Redeploy frontend

Old token: `0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69`

---

## STATUS: READY FOR MIGRATION

All preparation complete. Waiting for GO signal.

**DO NOT EXECUTE UNTIL AUTHORIZED.**
