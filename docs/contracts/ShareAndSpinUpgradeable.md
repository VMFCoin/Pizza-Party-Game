# ShareAndSpinUpgradeable

Replaces the referral system. Players share a Farcaster cast, earn ~$0.01 PIZZA + 1 topping, then spin a wheel for a free slice or gold prize.

**Last verified on-chain: April 23, 2026**

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`, `PausableUpgradeable`
- Pausable: Yes — `pause()` / `unpause()` exist. Currently `paused = false`.
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor does NOT call `_disableInitializers()`
- Solidity: 0.8.24
- Backend signer: `0x528952ae107198011C2a1df8c05A82702D5778D6` (all writes gated to this EOA)

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | `0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C` |
| Current implementation | `0x0cd17b5adc63d013ef1b2b1f4e72219636c91e95` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |
| Backend signer | `0x528952ae107198011C2a1df8c05A82702D5778D6` |

## On-Chain State (verified live)

| Variable | Value |
|---|---|
| `pizzaToken` | `0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07` |
| `treasuryWallet` | `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292` |
| `backendSigner` | `0x528952ae107198011C2a1df8c05A82702D5778D6` |
| `shareRewardAmount` | 55,679 PIZZA (~$0.01 at current price) |
| `shareSpinGoldAwardedWeekId` | 19 (matches current weeklyGameId → gold already hit this week) |
| `maxEntryFee` | 0 (dynamic validation instead: entryFee ≤ holdingsUnitPizza × 2) |
| Allowance `treasury → ShareAndSpin` | ~19,431 PIZZA (low — needs top-up soon) |

## Purpose

- Player composes a cast on Farcaster referencing Pizza Party
- Neynar API verifies the cast (correct FID, has embed, ≤10 min old, not reused)
- Backend signer calls `recordShare` → player gets ~$0.01 PIZZA from treasury + 1 topping on PizzaParty
- Backend signer calls `recordShareSpin` → wheel outcome: Nothing (94%) / Free Slice (5%) / Gold (1%)
- Free Slice = free daily entry (saved for tomorrow or gifted to friend)
- Gold = real pizza IRL + free slice + owner notified, max 1 per week

## Core Constants

```solidity
MAX_SHARES_PER_WEEK = 3
SHARE_SPIN_WEIGHT_TOTAL = 1000
SHARE_SPIN_NOTHING_MAX = 939        // 0-939 = Nothing (94%)
SHARE_SPIN_FREESLICE_MAX = 989      // 940-989 = Free Slice (5%)
// 990-999 = Gold (1%)
```

## Storage Layout (Append-Only — do not reorder)

- Slot 0: `pizzaToken` (IERC20)
- Slot 1: `pizzaParty` (IPizzaPartyForShare) — was originally used, now partially deprecated
- Slot 2: `treasuryWallet`
- Slot 3: `playerLastShareTimestamp[addr]`
- Slot 4: `shareRewardAmount`
- Slot 5: `shareSpinGoldAwardedWeekId`
- Slot 6: `shareSpinNonce` (private)
- Slot 7: `weeklySharesUsed[weekId][addr]`
- Slot 8: `usedCastHashes[bytes32]` — replay protection
- Slot 9: `lastShareGameId[addr]`
- Slot 10: `playerShareToppings[addr]` (legacy — toppings now added directly to PizzaParty)
- Slot 11: `backendSigner`
- Slot 12: `hasFreeSlice[addr]`
- Slot 13: `pendingFreeSlice[addr]`
- Slot 14: `maxEntryFee`

## Critical Functions

### User-facing flow (via backend signer)

| Function | Caller | Purpose |
|---|---|---|
| `recordShare(player, claimedReward)` | **`backendSigner`** | Verify share, pay ~$0.01 PIZZA from treasury, add 1 topping. Validates `claimedReward ≤ shareRewardAmount × 2`. |
| `recordShareSpin(player, castHashBytes32)` | **`backendSigner`** | Roll wheel (94/5/1), check cast hash dedup, handle outcome |
| `claimFreeSlice(player, entryFee)` | **`backendSigner`** | Redeem free slice immediately into today's game |
| `saveFreeSlice(player)` | **`backendSigner`** | Store free slice for tomorrow |
| `claimPendingSlice(player, entryFee)` | **`backendSigner`** | Claim yesterday's saved free slice |
| `giftFreeSlice(player, recipient, entryFee)` | **`backendSigner`** | Send free slice to a friend |

### Views

- `getShareInfo(player)` → bundle of share state
- `_validateEntryFee(entryFee)` internal — checks against `holdingsUnitPizza × 2`

### Admin

- `adminSetShareRewardAmount(amount)` — update $0.01 PIZZA equivalent when price changes
- `adminSetTreasuryWallet(addr)`
- `adminSetPizzaParty(addr)`
- `adminSetBackendSigner(addr)` — for key rotation
- `pause()` / `unpause()`

## Security Model

- **EVERY write function is backend-signer-gated.** This is the post-April-2026 pattern. No EOA check needed because only the backend EOA can call these.
- **Cast hash dedup:** `usedCastHashes[hash]` prevents reuse
- **Per-week limit:** `MAX_SHARES_PER_WEEK = 3`
- **Per-day limit:** `lastShareGameId[player]` — 1 share per daily game
- **Reward cap:** `claimedReward ≤ shareRewardAmount × 2` inside `recordShare`
- **Entry fee cap:** dynamically validated vs. `holdingsUnitPizza × 2`
- **Gold cap:** 1 per week globally via `shareSpinGoldAwardedWeekId`

## Wheel Outcomes

Roll (0-999):
- 0-939 → Nothing (94%): already got ~$0.01 PIZZA + 1 topping from `recordShare`
- 940-989 → Free Slice (5%): `hasFreeSlice[player] = true`
- 990-999 → Gold (1%): real pizza + free slice + owner notified; downgraded to Free Slice if already hit this week

## Integration Points

- **→ Treasury:** pulls share reward + free slice entry fees via `safeTransferFrom` (needs approval)
- **→ PizzaParty:**
  - `addToppingsFromShareAndSpin(player, 1)` called inside `recordShare`
  - `enterDailyFromShareAndSpin(player, entryFee)` called when claiming free slice
- **← Backend signer:** all writes routed through `0x528952ae...`

## Known History

- **Sybil exploit (April 5, 2026):** attacker deployed factory contract, spawned 120 micro-contracts, each called `recordShare()` as unique `msg.sender` before backend signer pattern was added. Drained ~492K PIZZA (~$29) from treasury. Root cause: no EOA or signer check. See `docs/SECURITY.md`.
- **Fix deployed (April 6-8):** backend signer pattern on all write functions, treasury approval capped (1M PIZZA), dumper monitor launched.
- **Gift/save free slice added:** after initial launch, players got options to save or gift their free slice.
- **Gold prize (1%):** awards real pizza IRL, owner notified via Farcaster cast.

## Files

- `foundry/src/ShareAndSpinUpgradeable.sol` (322 lines)
- Frontend: `app/components/game/ShareAndSpinModal.tsx`, `app/components/game/index.tsx`
- API routes: `app/api/share/verify-cast/route.ts`, `app/api/share/record/route.ts`, `app/api/share/execute/route.ts`
