# PizzaTippingVaultUpgradeable

**STATUS: PLANNED — NOT YET BUILT.** This document is the locked spec. No contract code exists yet. No deployment yet.

A staking-backed, on-chain-controlled tipping wallet system for Farcaster social payments. Players who earn staking rewards can route them into a personal "tip jar" inside this vault. They tip other Farcaster users by replying to casts with `1000 🍕` or `1000 $pizza` — backend verifies the cast, vault transfers PIZZA to recipient.

**Spec last updated:** April 28, 2026 — LOCKED

## Overview

Users earn $PIZZA from staking and choose:

- **WALLET** → sent to wallet (existing — `claimAfterSpin`)
- **STAKE** → compounded (existing — `restake`)
- **TIP** → sent to tipping vault (new — `claimToTip`)

If TIP is selected:
- Tokens are transferred into the vault
- Vault credits internal balance
- User can tip via Farcaster, or withdraw anytime to wallet

## Architecture (3 pieces)

| Layer | Role |
|---|---|
| Staking (existing, modified minimally) | Earnings engine — generates rewards, routes them into vault via `claimToTip()` |
| **Tipping Vault** (this contract, new) | Personal balance ledger — holds `tipBalance[user]`, executes tips, allows withdrawal |
| Backend Signer (new dedicated EOA) | Execution layer — only it can call `spendTip` after validating Farcaster casts |

Farcaster is the input layer. Users don't hold spendable PIZZA in their wallet for tipping — they hold internal vault credit.

## Locked Decisions

| # | Decision | Final Value |
|---|---|---|
| 1 | Self-tip | Blocked in contract (`require(from != to)`) |
| 2 | Min tip | 1,000 PIZZA |
| 3 | Daily caps | None — only `maxTipPerCast` and `maxCreditPerTx` |
| 4 | Stale balance | Keep forever |
| 5 | Ban interaction | Manual `forfeitTips` (owner-triggered, emergency only) |
| 6 | Token custody | Push-then-credit (staking transfers PIZZA into vault, then calls `credit()`) |
| 7 | Backend signer | NEW dedicated EOA, key in Vercel as `BACKEND_TIPPING_SIGNER_PRIVATE_KEY` (separate from existing `BACKEND_SIGNER_PRIVATE_KEY`) |
| 8 | `withdraw()` when paused | Always works (user safety valve) |
| 9 | `credit()` cap | `maxCreditPerTx = 100,000,000 PIZZA` |
| 10 | Ownership model | `OwnableUpgradeable` (single-step) — matches existing pattern across all 4 deployed contracts |
| 11 | FID requirement | `recipientFid` passed to `spendTip`; contract requires `> 0` |
| A | Token format in cast | Case-insensitive `$pizza` / `🍕`. Regex: `/(\d+)\s*(🍕|\$pizza)/i` |
| B | FID enforcement | On-chain check (`require(recipientFid > 0)`) plus Neynar verify off-chain |
| D | `maxTipPerCast` | 10,000,000 PIZZA (~$50 at current price) |
| E | `maxCreditPerTx` | 100,000,000 PIZZA (handles big stakers + jackpot + APY) |
| F | `forfeitTips` recipient | Treasury (`0xBfCA21E41D397C8B6beF0c348D394DA2c4826292`) |
| G | Vault owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (same as other contracts) |

## As Designed

- Inherits: `UUPSUpgradeable`, `OwnableUpgradeable`, `ReentrancyGuardUpgradeable`, `PausableUpgradeable`
- Pausable: yes — `pause()` / `unpause()` freeze `credit` and `spendTip`. `withdraw()` always works.
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (single-step transfer, matches existing system)
- Constructor calls `_disableInitializers()` (closes implementation-init footgun — fixes a gap noted in `docs/SECURITY.md`)
- Storage gap `uint256[50] __gap` at end (reserved for future appends)
- Solidity: 0.8.24
- Uses `SafeERC20` for all token movements

## Storage Layout (Append-Only Forever)

| Slot | Variable | Type | Purpose |
|---|---|---|---|
| 0 | `pizzaToken` | `address` | The PIZZA ERC20 (`0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07`) |
| 1 | `stakingContract` | `address` | Only this address can call `credit()` |
| 2 | `backendSigner` | `address` | Only this address can call `spendTip()` |
| 3 | `treasury` | `address` | Destination for `forfeitTips()` |
| 4 | `tipBalance[user]` | `mapping(address => uint256)` | Each user's spendable tip jar balance |
| 5 | `usedCastHashes[hash]` | `mapping(bytes32 => bool)` | Replay protection per cast |
| 6 | `minTipAmount` | `uint256` | Floor: 1,000 × 1e18 PIZZA |
| 7 | `maxTipPerCast` | `uint256` | Single-tip cap: 10,000,000 × 1e18 PIZZA |
| 8 | `maxCreditPerTx` | `uint256` | Sanity cap on `credit()` from staking: 100,000,000 × 1e18 PIZZA |
| 9–58 | (reserved for future appends) | — | — |
| 59 | `__gap[50]` | — | Storage gap |

## Events

```solidity
event Credited(address indexed user, uint256 amount);
event Tipped(address indexed from, address indexed to, uint256 amount, uint256 recipientFid, bytes32 castHash);
event Withdrawn(address indexed user, uint256 amount);
event Forfeited(address indexed user, uint256 amount);
event BackendSignerUpdated(address indexed oldSigner, address indexed newSigner);
event StakingContractUpdated(address indexed oldStaking, address indexed newStaking);
event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
event LimitsUpdated(uint256 minTipAmount, uint256 maxTipPerCast, uint256 maxCreditPerTx);
```

## Functions

### `credit(address user, uint256 amount)`

- **Caller:** `stakingContract` only
- **Modifiers:** `whenNotPaused`, `nonReentrant`
- **Reverts if:**
  - `msg.sender != stakingContract`
  - `amount == 0`
  - `amount > maxCreditPerTx`
- **State change:** `tipBalance[user] += amount`
- **Note:** PIZZA tokens must already be in the vault when this is called (push-then-credit pattern). Staking transfers tokens first, then calls `credit()` in the same transaction.
- **Emits:** `Credited(user, amount)`

### `spendTip(address from, address to, uint256 recipientFid, uint256 amount, bytes32 castHash)`

- **Caller:** `backendSigner` only
- **Modifiers:** `whenNotPaused`, `nonReentrant`
- **Reverts if:**
  - `msg.sender != backendSigner`
  - `from == to` (self-tip block)
  - `recipientFid == 0` (FID required)
  - `amount < minTipAmount`
  - `amount > maxTipPerCast`
  - `usedCastHashes[castHash] == true` (replay)
  - `tipBalance[from] < amount` (insufficient)
- **State changes (Checks-Effects-Interactions order — CRITICAL):**
  1. `usedCastHashes[castHash] = true`
  2. `tipBalance[from] -= amount`
  3. `IERC20(pizzaToken).safeTransfer(to, amount)`
- **Emits:** `Tipped(from, to, amount, recipientFid, castHash)`

### `withdraw(uint256 amount)`

- **Caller:** any user (signs themselves)
- **Modifiers:** `nonReentrant` ONLY (intentionally NOT `whenNotPaused` — this is the safety valve)
- **Reverts if:**
  - `amount == 0`
  - `tipBalance[msg.sender] < amount`
- **State changes:**
  1. `tipBalance[msg.sender] -= amount`
  2. `IERC20(pizzaToken).safeTransfer(msg.sender, amount)`
- **Emits:** `Withdrawn(msg.sender, amount)`

### `forfeitTips(address user)`

- **Caller:** `onlyOwner`
- **Purpose:** Manual emergency for confirmed cheaters/hackers. Sweeps full balance to treasury.
- **Reverts if:**
  - `tipBalance[user] == 0`
- **State changes:**
  1. `uint256 bal = tipBalance[user]`
  2. `tipBalance[user] = 0`
  3. `IERC20(pizzaToken).safeTransfer(treasury, bal)`
- **Emits:** `Forfeited(user, bal)`

### Admin functions (all `onlyOwner`)

- `setBackendSigner(address newSigner)` — for key rotation, emits `BackendSignerUpdated`
- `setStakingContract(address newStaking)` — for staking upgrades, emits `StakingContractUpdated`
- `setTreasury(address newTreasury)` — for treasury rotation, emits `TreasuryUpdated`
- `setLimits(uint256 newMin, uint256 newMaxTipPerCast, uint256 newMaxCreditPerTx)` — for tuning, emits `LimitsUpdated`
- `pause()` / `unpause()` — emergency freeze
- `transferOwnership(newOwner)` (inherited from `OwnableUpgradeable`)

## Initialization

```solidity
function initialize(
    address _pizzaToken,
    address _stakingContract,
    address _backendSigner,
    address _treasury,
    address _owner
) external initializer
```

Sets initial values:
- `pizzaToken` = `0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07`
- `stakingContract` = `0xCbAf5bACe5419710C3852653d3DdEB831d7415be`
- `backendSigner` = NEW dedicated EOA (TBD when generated by user)
- `treasury` = `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292`
- Transfers ownership to `_owner` = `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC`
- `minTipAmount` = `1_000 * 1e18`
- `maxTipPerCast` = `10_000_000 * 1e18`
- `maxCreditPerTx` = `100_000_000 * 1e18`

## Staking Contract Changes (PizzaStakingV1Upgradeable)

This is the surgical change to existing staking. Per `docs/SECURITY.md` Rule 4, only append.

### New storage slot (appended at end)

```solidity
address public tippingVault;
```

Goes after the existing `goldChancePct` slot. Run `forge inspect storage-layout` before and after the change to diff — must show ONLY one append, no reorder.

### New admin setter

```solidity
function adminSetTippingVault(address) external onlyOwner
```

### New external function

```solidity
function claimToTip() external nonReentrant whenNotPaused tokenSet
```

Behavior (mirrors `claimAfterSpin` exactly, only difference is destination):

1. Calls existing `_claimAllRewards`-style logic with `applySpin = true`
2. Reward calculation is IDENTICAL to `claimAfterSpin`:
   - `baseReward` from contract balance
   - Apply spin multiplier (using `committedSpinOutcome[user]`)
   - Apply jackpot fixed bonus if outcome == Jackpot
   - Apply tier + lock + early bonuses on spun amount
   - Apply APY for locked positions
   - Funding split: base from contract balance, extras from `stakingRewardsWallet` via `safeTransferFrom`
3. After calculating `finalReward`, instead of transferring to user:
   - `IERC20(pizzaToken).safeTransfer(tippingVault, finalReward)` — push tokens to vault
   - `ITippingVault(tippingVault).credit(msg.sender, finalReward)` — update vault ledger
4. Updates `lifetimeClaimed[user]` (same as other claim paths)
5. Updates reward debt and `lastApyClaimTimestamp` (same)

**Critical:** Reward math is shared with `claimAfterSpin` and `restake`. NO duplicated math. If we change reward logic, all three paths must change together.

## Backend / API Plan

### New API route: `POST /api/tip/execute`

Triggered by Neynar webhook (preferred) or cron poll. Verification chain — ALL must pass:

1. Cast is a **REPLY**, not a root cast
2. Cast text matches regex `/(\d+)\s*(🍕|\$pizza)/i` — extract **FIRST match only**
3. `castHash` not in Postgres `tip_casts` table (fast reject)
4. `castHash` not in `vault.usedCastHashes(hash)` (on-chain confirm)
5. Author FID → author wallet via Neynar `bulk-by-address`
6. Parent author FID → recipient wallet via Neynar
7. `recipientFid > 0`
8. Recipient wallet not on banList AND recipient FID not on banList
9. `from != to` (sender wallet ≠ recipient wallet)
10. Cast age < 10 minutes
11. Author wallet not on banList
12. `tipBalance[author] >= amount` (read from contract)

If all pass:
- Backend signer (private key from `BACKEND_TIPPING_SIGNER_PRIVATE_KEY` Vercel env) calls:
- `vault.spendTip(authorWallet, recipientWallet, recipientFid, amount, castHash)`

If contract reverts:
- Log reason in Postgres `tip_casts` (status: `failed`, error: reason)
- Don't retry the same cast hash

### New API route: `GET /api/tip/balance/:wallet`

Returns:
- `tipBalance` from contract
- Recent tip history from event logs or DB cache

### Postgres tables (new)

- `tip_casts` — every processed cast: `cast_hash`, `from_wallet`, `to_wallet`, `recipient_fid`, `amount`, `status` (pending/sent/failed), `error`, `created_at`, `tx_hash`

### Monitoring (extend existing dumper monitor cron)

Alert via Farcaster notification to owner FID 1013491 if:
- Any single tip > 5,000,000 PIZZA (half the cap — early warning)
- Backend tipping signer ETH balance < 0.001 ETH (gas top-up needed)
- Anomalous tip velocity (TBD threshold after observing real usage)

## Frontend Changes (StakingPage.tsx)

### Claim modal (after spin)

Today: `[ WALLET ]  [ STAKE ]`
After: `[ WALLET ]  [ STAKE ]  [ TIP ]`

When TIP tapped → user signs `claimToTip()`. After confirmation, modal shows new tip balance.

### New "Tip Balance" panel on staking page

Below the rewards card:
- Current balance: `X PIZZA` (read from `vault.tipBalance(user)`)
- "Withdraw to Wallet" button → calls `vault.withdraw(amount)`
- Activity feed (recent tips sent / received) — from API

### Reads from contract

- `vault.tipBalance(user)` — current balance
- `vault.minTipAmount()`, `vault.maxTipPerCast()` — for UI display

## Farcaster Input Rules

### Valid inputs (case-insensitive)

```
1000 🍕
1000 $pizza
1000 $PIZZA
1000 $Pizza
gm fam 1000 🍕
sending you 2500 $Pizza for this take
this deserves 5000 🍕 fr
sending love 2000 $Pizza
```

### Invalid inputs

```
🍕 1000              (wrong order)
1000 pizza           (no $ symbol on token)
nothing here         (no match)
```

### Parser logic

- Find ALL matches in the cast text using `/(\d+)\s*(🍕|\$pizza)/i`
- Use ONLY the FIRST match
- Extract `amount` (number) — token must be `🍕` or `$pizza` (case-insensitive)
- Multiple matches in the same cast → only the first is processed

### Why first-match-only

- Prevents multi-tip abuse (one cast trying to send to multiple people)
- Prevents parsing ambiguity
- Prevents double execution attempts

## Security Model

### Inherited from staking (already in place — DO NOT reinvent)

- **$1 min stake gate** — every wallet that can ever have a tip balance has committed $1 PIZZA at staking. Foundational sybil defense across the system.
- **`tx.origin == msg.sender` on `recordSpin`** — staking already blocks contract-call sybils.

### New defenses in this contract

| Threat | Defense |
|---|---|
| Compromised backend signer drains all balances | `maxTipPerCast = 10M PIZZA` cap per call. Per-tip blast radius bounded. |
| Same cast replayed | `usedCastHashes[hash]` mapping |
| Self-tip for clout | `require(from != to)` in contract |
| Tipping to ghost wallet | `require(recipientFid > 0)` in contract + Neynar FID resolution off-chain |
| Dust griefing | `minTipAmount = 1,000 PIZZA` |
| User funds locked in vault | `withdraw()` works user-signed, ALWAYS (even when paused) |
| Implementation init attack | `_disableInitializers()` in constructor |
| Storage corruption on future upgrade | `__gap[50]` reserved + Rule 4 discipline |
| Cascade from staking exploit (unbounded `credit`) | `maxCreditPerTx = 100M PIZZA` cap |
| Front-running | N/A — tip is internal vault → wallet, no DEX path |

### Accepted trust

This system relies on:
- Backend signer honesty (mitigated by per-tip caps + FID requirement + `castHash` dedup)
- Neynar correctness (industry-standard for Farcaster FID resolution)
- Off-chain ban list enforcement (mitigated by manual `forfeitTips`)

These are the same trust assumptions as every other Farcaster financial product.

### Note on single-step Ownable

Vault uses `OwnableUpgradeable` (single-step transfer) to match the existing system. If owner key is compromised, attacker can `transferOwnership` instantly. Same risk as the other 4 contracts — see `docs/SECURITY.md` "Current Contract Access Control" gap note.

## Critical Invariants

These MUST always hold:

1. **All tip balances originate from staking rewards.** No other entry point to `credit()`. No `deposit()` function. No way for a user to push PIZZA into the vault for someone else.
2. **Vault PIZZA balance ≥ sum of all `tipBalance[user]`.** If this is violated, the vault has been drained and won't be able to honor withdrawals.
3. **Each cast can only execute one tip.** `usedCastHashes[castHash]` = true after spend.
4. **Users can always withdraw their own balance.** `withdraw()` works even when paused.
5. **Backend cannot fabricate balances.** Only `credit()` can increase `tipBalance`, and only `stakingContract` can call `credit()`.
6. **`from != to` always.** No self-tipping permitted.
7. **`recipientFid > 0` always.** No tipping to ghost wallets.

## Wiring (after deployment)

```
PIZZA token (0xa821f2ee...)
  ↓ (push from staking via safeTransfer)
TippingVault proxy (TBD)
  ↑ stakingContract (set via initialize / setStakingContract)
  ↑ backendSigner (set via initialize / setBackendSigner — NEW EOA)
  ↑ owner (0xd9EF10D1...)
  ↓ (treasury for forfeit)
Treasury (0xBfCA21E4...)

PizzaStakingV1 proxy (0xCbAf5bAC...)
  ↑ tippingVault (set via adminSetTippingVault after vault deploy)
```

## Out of Scope (NOT in v1)

- Direct deposits into vault (no `deposit()` function — only credits from staking)
- Daily caps on tip volume or count (not enforced — only per-tip cap)
- Tip leaderboards (could be added later as off-chain feature)
- Time-decaying tip balances
- Tip-back / receive-tip credits
- Captcha (unnecessary — value gated upstream by staking)
- Cross-chain tipping
- Native ETH tips (PIZZA only)

## Deployment Checklist

### Build phase

- [ ] Write `foundry/src/PizzaTippingVaultUpgradeable.sol`
- [ ] Modify `foundry/src/PizzaStakingV1Upgradeable.sol`:
  - [ ] Append `address public tippingVault;` slot
  - [ ] Add `adminSetTippingVault(address)` function
  - [ ] Add `claimToTip()` function (mirroring `claimAfterSpin` math, destination = vault)
- [ ] Add `ITippingVault` interface to staking imports
- [ ] Write `foundry/test/PizzaTippingVault.t.sol` covering:
  - [ ] `credit` happy path
  - [ ] `credit` reverts: not staking, amount > maxCreditPerTx
  - [ ] `spendTip` happy path
  - [ ] `spendTip` reverts: not backend signer, self-tip, FID=0, below min, above max, replay, insufficient
  - [ ] `withdraw` happy path
  - [ ] `withdraw` works when paused
  - [ ] `forfeitTips` happy path + reverts
  - [ ] `pause`/`unpause` block writes
  - [ ] All admin setters
- [ ] Write `foundry/test/StakingClaimToTip.t.sol`:
  - [ ] `claimToTip` with each spin outcome (Regular, Loaded, Hot, Jackpot)
  - [ ] `claimToTip` with locked-only, flexible-only, both
  - [ ] `claimToTip` reward math matches `claimAfterSpin`
  - [ ] `claimToTip` reverts when paused, when no rewards, when no spin recorded
- [ ] Run storage-layout diff on staking — MUST be append-only
- [ ] Run `forge build --sizes` on staking — MUST stay under 24,576 bytes
- [ ] Run `forge build --sizes` on vault — must be reasonable size
- [ ] All `forge test` passing

### Documentation phase (BEFORE deploy)

- [x] This spec doc finalized
- [ ] Update `docs/contracts/PizzaStakingV1Upgradeable.md`:
  - [ ] Add `tippingVault` to storage layout table
  - [ ] Add `claimToTip()` to function list
  - [ ] Add wiring entry
- [ ] Update `docs/SECURITY.md`:
  - [ ] Add tipping vault to access control table
  - [ ] Add backend tipping signer to backend-signer functions table
  - [ ] Update approval cap policy if vault needs allowances
- [ ] Update `docs/README.md` index with new contract row

### Deploy phase (user runs, never touches private keys via assistant)

- [ ] Generate NEW dedicated EOA for tipping backend signer
- [ ] Fund EOA with ~0.002 ETH on Base for gas
- [ ] Add `BACKEND_TIPPING_SIGNER_PRIVATE_KEY` to Vercel env (separate from existing `BACKEND_SIGNER_PRIVATE_KEY`)
- [ ] Deploy `PizzaTippingVaultUpgradeable` proxy with init params
- [ ] Verify on Sourcify only (NOT Basescan — keeps source private from bots until confident)
- [ ] Upgrade staking contract to new implementation (with `claimToTip` + `tippingVault` slot + setter)
- [ ] Call `staking.adminSetTippingVault(vaultProxy)`
- [ ] Verify on-chain: `staking.tippingVault() == vaultProxy`
- [ ] Verify on-chain: `vault.stakingContract() == stakingProxy`
- [ ] Verify on-chain: `vault.backendSigner() == newEOA`
- [ ] Verify on-chain: `vault.owner() == 0xd9EF10D1...`
- [ ] Verify on-chain: limits set correctly

### Frontend / API phase

- [ ] Add `[ TIP ]` button to claim modal in `StakingPage.tsx`
- [ ] Add tip balance panel + withdraw flow
- [ ] Build `/api/tip/execute` route
- [ ] Build `/api/tip/balance/:wallet` route
- [ ] Build Neynar webhook handler
- [ ] Create Postgres `tip_casts` table
- [ ] FID-gate to test users initially
- [ ] Test in staging with allow-list before public launch

### Monitoring phase

- [ ] Extend dumper monitor cron with tip alerts
- [ ] Watch first 48 hours of tip activity
- [ ] Be ready to call `vault.pause()` if anything anomalous

### Launch phase

- [ ] Remove FID gate (if any)
- [ ] Public announcement
- [ ] Update CLAUDE.md to mark tipping as ACTIVE (not PLANNED)

## Files (planned)

- `foundry/src/PizzaTippingVaultUpgradeable.sol` (new)
- `foundry/src/PizzaStakingV1Upgradeable.sol` (modified — append slot + add `claimToTip`)
- `foundry/script/DeployPizzaTippingVault.s.sol` (new)
- `foundry/script/UpgradeStakingClaimToTip.s.sol` (new)
- `foundry/test/PizzaTippingVault.t.sol` (new)
- `foundry/test/StakingClaimToTip.t.sol` (new)
- `app/components/StakingPage.tsx` (modified)
- `app/api/tip/execute/route.ts` (new)
- `app/api/tip/balance/[wallet]/route.ts` (new)
- `app/api/tip/webhook/route.ts` (new — Neynar webhook handler)
- `app/lib/constants/index.tsx` (add tipping vault address + ABI when deployed)
