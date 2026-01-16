# Additional Considerations for $PIZZA Token Switch

## What This Migration IS
- Switching Pizza Party game to use a NEW $PIZZA token contract
- Players will use the new token for entries, staking, parlor purchases
- Burns will go to the new token contract

## What This Migration IS NOT
- NOT a token swap/migration for existing holders
- The old token and new token are completely separate
- Users need to acquire the new token themselves

---

## Critical Pre-Launch Checklist

### 1. Liquidity & Price Feeds
- [ ] **DEX Liquidity** - New token MUST have liquidity on a Base DEX (Uniswap, Aerodrome, etc.)
- [ ] **Price Feed Working** - DexScreener/GeckoTerminal must return prices for the new token
- [ ] **Test Price API** - Run this check before launch:
  ```bash
  curl "https://api.dexscreener.com/latest/dex/tokens/NEW_TOKEN_ADDRESS"
  ```
  Should return `priceUsd` in the response

**Why this matters:** The game uses dynamic pricing based on $PIZZA price. If price feeds don't work:
- Game entries will fail or use wrong amounts
- Parlor purchases will be mispriced

### 2. Treasury & Rewards Wallets
- [ ] **Treasury Wallet** - Must hold new $PIZZA tokens for free slice distributions
  - Address: Check `treasuryWallet` in PizzaParlorManager
  - Used for: `claimSlice()` and `sendSlice()` functions

- [ ] **Staking Rewards Wallet** - Must hold new $PIZZA for reward distributions
  - Address: Check `stakingRewardsWallet` in PizzaStaking
  - Used for: Bonus rewards beyond base staking rewards

### 3. Contract Balance Considerations
- [ ] **PizzaStaking Contract** - Will need new tokens for base staking rewards
  - Current stakers using OLD token - what happens to them?
  - **Decision needed:** Do you end old staking first, or run parallel?

- [ ] **PizzaPartyV2 Contract** - Daily jackpot funded by entry fees
  - Old accumulated tokens won't transfer
  - New jackpot starts from zero with new token

### 4. Verify Burn Function
Clanker contracts have burn, but verify the signature:
```solidity
// Expected signature (what PizzaParlorManager calls):
function burn(uint256 amount) external;

// The contract burns from its OWN balance, not from msg.sender
// So the contract must hold tokens before calling burn
```

Test on Basescan:
1. Go to new token contract
2. Check "Write Contract" tab
3. Verify `burn(uint256)` function exists

### 5. EIP-712 Permit Domain (Frontend)
If the new token has a different name, update the permit domain in constants:

Current in `app/lib/constants/index.tsx`:
```typescript
PERMIT_DOMAIN: {
  name: 'Pizza',  // <-- May need to change if token name differs
  version: '1',
  chainId: 8453,
  verifyingContract: PIZZA_TOKEN_ADDRESS
}
```

Check new token's EIP-712 domain name by calling:
```bash
cast call NEW_TOKEN "DOMAIN_SEPARATOR()" --rpc-url base
# or check the token contract source
```

---

## Staking Migration Strategy Options

### Option A: Clean Cutover
1. Announce migration date
2. Users unstake from old staking contract
3. Update contracts to new token
4. Users stake new tokens

**Pros:** Clean slate, no complexity
**Cons:** Users temporarily without staking rewards

### Option B: Parallel Period
1. Deploy new staking with new token
2. Old staking continues for grace period
3. Users migrate at their convenience
4. Deprecate old staking

**Pros:** Smoother user experience
**Cons:** More complex to manage

### Option C: Admin Migration (if supported)
1. Snapshot all staking positions
2. Update token address
3. Airdrop equivalent new tokens to stakers

**Pros:** Seamless for users
**Cons:** Requires tokens for airdrop, complex

**Recommendation:** Option A (Clean Cutover) is simplest if you coordinate timing well.

---

## 100 Billion Supply Impact

With 100B supply (vs typical smaller supplies), the token price will be lower.

### Current Safety Bounds to Review:
| Parameter | Current | Concern |
|-----------|---------|---------|
| Min entry (0.01 PIZZA) | ~$0.00001 at $0.001/token | May be too small |
| Max entry (1000 PIZZA) | ~$1 at $0.001/token | May be too small |
| Min parlor (500 PIZZA) | ~$0.50 at $0.001/token | May need adjustment |
| Max parlor (500K PIZZA) | ~$500 at $0.001/token | Probably fine |
| Max stake (1M PIZZA) | ~$1000 at $0.001/token | May need increase |

**These are just the SAFETY BOUNDS** - the actual dynamic pricing targets $1 entry and $50 parlor, so it should auto-adjust. But verify the bounds allow the dynamic pricing room to work.

---

## Testing Plan

### Before Going Live:
1. **Unit Test** - Update foundry tests with new token, run full suite
2. **Local Fork Test** - Fork Base mainnet, deploy mock new token, test full flow
3. **Testnet Deploy** (if possible) - Full deployment on Base Sepolia with test token

### Smoke Tests After Migration:
1. [ ] Price feeds returning data
2. [ ] Can enter daily game with new token
3. [ ] Can stake new token
4. [ ] Can purchase parlor
5. [ ] Parlor burn executes successfully
6. [ ] Free slice claim works (treasury has tokens)
7. [ ] Staking rewards distribute (rewards wallet has tokens)

---

## Announcement Template

```
PIZZA PARTY TOKEN UPDATE

We're switching to the new $PIZZA token!

NEW TOKEN ADDRESS: 0x...

What you need to do:
1. Acquire the new $PIZZA token
2. Unstake any old tokens (if staking)
3. Use new tokens in the game

The game will switch to the new token on [DATE/TIME].

Old token will no longer be used in the game after this date.
```

---

## Emergency Contacts / Resources

- Base RPC: https://mainnet.base.org
- Basescan: https://basescan.org
- DexScreener: https://dexscreener.com/base/
- Contract Addresses:
  - PizzaPartyV2: 0xA1C31c3eF1448351da0b1D430148660982B6f3dD
  - PizzaStaking: 0xCbAf5bACe5419710C3852653d3DdEB831d7415be
  - ParlorManager: 0x7acfaa1dadd836404a8d90b49581758c4fdc889b
