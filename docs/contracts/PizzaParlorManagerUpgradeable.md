# PizzaParlorManagerUpgradeable

NFT-like parlor ownership, franchise fee distribution, free slice delivery to players.

**Last verified on-chain: April 23, 2026**

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`
- No Pausable — cannot be frozen
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor calls `_disableInitializers()`
- Solidity: 0.8.24
- Backend signer: `0x528952ae107198011C2a1df8c05A82702D5778D6`
- EIP-712 domain used for slice vouchers (see `SLICE_VOUCHER_TYPEHASH`)

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | `0x7acfaa1dadd836404a8d90b49581758c4fdc889b` |
| Current implementation | `0x204268a7252c616300326f6126c729421c4cefbf` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |
| Backend signer | `0x528952ae107198011C2a1df8c05A82702D5778D6` |

## On-Chain State (verified live)

| Variable | Value |
|---|---|
| `treasuryWallet` | `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292` |
| `opsWallet` | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (owner wallet) |
| `backendSigner` | `0x528952ae107198011C2a1df8c05A82702D5778D6` |
| `parlorPrice` | 50,000 PIZZA (legacy fixed price — dynamic $50 calc is actually used) |
| `totalParlors` | 89 |
| `maxSliceEntryFee` | 0 (disabled — validated dynamically instead) |

## Purpose

- Sell parlors (up to 100 globally, max 5 per wallet) — players pay PIZZA worth ~$50
- Accrue franchise fees from PizzaParty daily pot allocations
- Distribute fees: 50% to parlor owners (weighted), 30% to treasury, 20% to ops
- Allow parlor owners to send weekly "slices" to other players (free daily game entries)
- Support EIP-712 signed slice vouchers (backend signs, player redeems)

## Core Constants

```solidity
MAX_PARLORS = 100                     // Global cap
MAX_PARLORS_PER_WALLET = 5            // Per owner
WEEKLY_SLICES_PER_PARLOR = 1          // 1 slice/parlor/week (for 1-4 parlors)
MAX_SLICES_PER_DAY = 1                // Max 1 slice/day per sponsor
MAX_OWNER_WEEKLY_SLICES = 7           // Owners with 5 parlors get 7/week (1/day)

MIN_PARLOR_PRICE = 1
MAX_PARLOR_PRICE = type(uint256).max

// Parlor sale fee distribution
BURN_BPS = 5000          // 50% burned
TREASURY_BPS = 3000      // 30% treasury
OPS_BPS = 2000           // 20% ops

// Franchise fee distribution (from PizzaParty daily pot)
FRANCHISE_TREASURY_BPS = 3000   // 30% treasury
FRANCHISE_OWNERS_BPS = 5000     // 50% parlor owners
FRANCHISE_OPS_BPS = 2000        // 20% ops
```

## Storage Layout (Append-Only — do not reorder)

Declaration order (high level):

- `treasuryWallet`, `opsWallet`
- `parlorPrice` (legacy, actual pricing is dynamic)
- `totalParlors`, `parlorCount[owner]`, `isParlorOwner[owner]`
- `lastSliceWeekId[sponsor]`, `slicesUsedThisWeek[sponsor]`, `lastSliceDayId[sponsor]`
- `lastSliceGameId[sponsor]`, `slicesUsedThisGame[sponsor]` — **LEGACY**
- `usedSliceNonce[sponsor][nonce]` — EIP-712 voucher replay protection
- `claimableBalance[owner]`, `lastProcessedBalance`
- `parlorName[owner]`
- `pendingSlices[recipient]` — recipient → pending slice info
- `lastSliceSentDayId[sponsor]`, `slicesSentToday[sponsor]`
- `maxSliceEntryFee`
- `backendSigner`

## Critical Functions

### Parlor Purchase

| Function | Caller | Purpose |
|---|---|---|
| `purchaseParlor(amountPaid)` | Player | Buy a parlor at dynamic ~$50 PIZZA price |
| `purchaseParlorLegacy()` | Player | Buy at fixed `parlorPrice` (legacy path) |

### Slice Distribution

| Function | Caller | Purpose |
|---|---|---|
| `sendSlice(recipient)` | Parlor owner | Grant free daily entry to `recipient` (rate-limited per day/week) |
| `claimSlice(player, entryFee)` | **`backendSigner`** | Player claims a pending slice — treasury pays entry fee |
| `redeemSlice(player, sponsor, nonce, deadline, sig, entryFee)` | **`backendSigner`** | Redeem an EIP-712 signed voucher |
| `tipSlice(recipient)` | Parlor owner | Legacy direct-tip slice |

### Fee Distribution

| Function | Caller | Purpose |
|---|---|---|
| `allocateFees()` | Anyone | Move new PizzaParty fees into claimable pool |
| `claimMyFees()` | Parlor owner | Withdraw earned franchise fees |
| `distributeFranchiseFees()` | Anyone | Push split to treasury/owners/ops |

### Admin / Naming

- `setParlorName(name)` — owner can name their parlor (one-time per parlor)
- `adminSetParlorName(owner, name)` — owner override
- `hasParlorName(owner)` / `parlorOwnersCount()` / `parlorOwnerAt(i)` / `parlorsRemaining()`
- `slicesRemainingToday(sponsor)` / `slicesRemainingThisWeek(sponsor)`
- `adminSetBackendSigner(addr)` — for key rotation

## EIP-712 Slice Voucher

```
SLICE_VOUCHER_TYPEHASH = keccak256(
    "SliceVoucher(address sponsor,address recipient,uint256 nonce,uint256 deadline)"
)
```

Backend signs with `BACKEND_SIGNER_PRIVATE_KEY`, player calls `redeemSlice` via backend relay.

## Franchise Fee Flow

1. PizzaParty daily pot allocates `parlorFeeBPS` portion
2. Fees accrue to parlor manager's PIZZA balance
3. `allocateFees()` moves new fees into `claimableBalance[owner]` weighted by parlor count
4. `claimMyFees()` lets owners withdraw their portion
5. `distributeFranchiseFees()` pushes the treasury/ops splits

## Invariants

- `totalParlors <= MAX_PARLORS` (100)
- `parlorCount[owner] <= MAX_PARLORS_PER_WALLET` (5)
- `slicesRemainingToday(sponsor)` respects `MAX_SLICES_PER_DAY`
- Voucher replay protection: `usedSliceNonce[sponsor][nonce]` once consumed
- `isParlorOwner[owner]` truthy iff `parlorCount[owner] > 0`

## Integration Points

- **→ PizzaParty:** `enterDailyWithSlice(player, sponsor, amount)` for sponsored entries
- **→ PIZZA token:** burns 50% of parlor sale price via `pizzaToken.burn()`
- **← Staking:** receives early unstake penalties (if set on staking)
- **← Backend signer:** `claimSlice` and `redeemSlice` gated to backend signer

## Known History

- **Backend signer migration (April 2026):** `claimSlice` and `redeemSlice` were made backend-signer-only after ShareAndSpin sybil exploit.
- **Pending slices system added:** allows parlor owners to send slices that recipients claim later.
- **Slices sent tracking:** separate from slices claimed — prevents spammy sending.
- **Weekly slices model:** replaced older daily model (legacy fields preserved in storage).

## Files

- `foundry/src/PizzaParlorManagerUpgradeable.sol` (1107 lines)
- Backend route: `app/api/slice/claim-backend/route.ts`, `app/api/slice/verify-claim/route.ts`
- Frontend: parlor pages
