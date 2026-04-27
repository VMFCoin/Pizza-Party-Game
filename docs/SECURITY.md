# Pizza Party — Security Rulebook

**This file is the single source of truth for security rules across all contracts. Read this BEFORE proposing any contract change, new contract, or deployment.**

---

## The 10 Critical Rules (NEVER VIOLATE)

1. **NEVER commit or expose private keys.** No `.env` contents, no wallet keys, no seed phrases. Ever. Not in commits, not in logs, not in comments.
2. **NEVER run commands containing private keys.** Only the user deploys contracts and runs Foundry scripts. Assistant can set `export PRIVATE_KEY=$(grep ^PRIVATE_KEY= .env | cut -d= -f2)` — never echo the value.
3. **NEVER hardcode values.** All parameters must have admin setter functions. Nothing hardcoded except protocol constants that should never change.
4. **NEVER reorder, insert, rename, or delete storage variables** in upgradeable contracts. New variables append at the END only. Always run `forge inspect <Contract> storage-layout > before.json` / `after.json` and `diff` before every upgrade.
5. **NEVER use unlimited token approvals.** Always cap approvals. Re-run approval scripts periodically to top up.
6. **NEVER make free-reward functions permissionless.** Any function that distributes free tokens, rewards, or entries from treasury/rewards wallet MUST use the backend signer pattern (see below). Until migrated, all such functions MUST have `require(tx.origin == msg.sender)` as minimum defense.
7. **NEVER trust caller-supplied amounts without validation.** Any function pulling from treasury must validate against a dynamic cap (e.g., `holdingsUnitPizza * 2`).
8. **NEVER rely on "unannounced" for security.** Deploying with `--verify` publishes full source instantly. Bots read it within seconds. All security must be in the code itself.
9. **NEVER modify `claimAfterSpin()`, `restake()`, or reward math** in `PizzaStakingV1Upgradeable` without re-reading the Spin the Pie state machine in its spec. These were stabilized after the April 2026 jackpot-payout bug.
10. **Documentation is part of the contract.** When you change a contract, update its `docs/contracts/<Name>.md` in the SAME commit. When you deploy a new implementation, update the address table. When a new exploit happens, add it to the "Known Attack Vectors" section below.

---

## The Sybil Defense: Min-Stake Gate

Every wallet interacting with staking, Spin the Pie, or (planned) Tipping must first stake **≥ $1 worth of PIZZA** (dynamic via `pizzaPriceMicroUsd`, with `MIN_STAKE_FALLBACK = 10,000 PIZZA`).

**This is the foundational sybil defense across the entire system.** Before proposing any additional sybil mitigation, verify whether the min-stake gate already handles it. 1,000 sybil wallets = 1,000 × $1 committed capital, and each sybil can only earn rewards based on its own stake.

Inheriting systems (Tipping Vault, any future reward distribution built on staking) get this defense for free — do not reinvent it.

---

## Backend Signer Pattern (Required Architecture)

All functions that give out free value (free tokens, free entries, rewards from treasury or staking rewards wallet) MUST use this pattern:

1. Player interacts via Vercel frontend
2. API verifies player (FID match, Neynar cast verification, rate limits, ban list check)
3. Backend signer wallet (dedicated EOA, key in Vercel env as `BACKEND_SIGNER_PRIVATE_KEY`) calls the contract
4. Contract only accepts these calls from `backendSigner` address
5. Include `adminSetBackendSigner(address)` for key rotation

**Backend signer EOA:** `0x528952ae107198011C2a1df8c05A82702D5778D6`
- Purpose: can ONLY call functions gated by `backendSigner` — low privilege
- Gas: funded with ~0.002 ETH on Base, ~$1/month at current usage
- Storage: `BACKEND_SIGNER_PRIVATE_KEY` env var on Vercel + local `.env`

**Functions currently using backend signer:**
| Contract | Function | Gives |
|---|---|---|
| ShareAndSpin | `recordShare` | ~$0.01 PIZZA from treasury |
| ShareAndSpin | `recordShareSpin` | Spin for free slice / gold |
| ShareAndSpin | `claimFreeSlice` | Free game entry from treasury |
| ShareAndSpin | `saveFreeSlice` | Save free slice for tomorrow |
| ShareAndSpin | `claimPendingSlice` | Claim saved free slice |
| ShareAndSpin | `giftFreeSlice` | Gift free entry to friend |
| ParlorManager | `claimSlice` | Claim parlor slice, treasury pays |
| ParlorManager | `redeemSlice` | Redeem signed slice voucher |

**Functions NOT using backend signer (player signs directly):** any function where the player pays with their own PIZZA (stake, unstake, claim, purchaseParlor, enterDailyGame, etc.).

---

## Approval Cap Policy

Never approve unlimited. Current caps:

| From | To | Cap | Current Allowance (verified live) | Script |
|---|---|---|---|---|
| Treasury (`0xBfCA...6292`) | ShareAndSpin | 1M PIZZA | **~19,431 PIZZA — LOW, top up soon** | `ApproveTreasuryForShareAndSpin.s.sol` |
| Staking rewards wallet (`0x0b30...1c56`) | Staking | 500M PIZZA | ~189.9M PIZZA — OK | `CapStakingRewardsApproval.s.sol` |

Re-run approval scripts when caps get close to zero. Monitor via `/api/cron/monitor-dumpers`.

---

## Storage Layout Discipline (UUPS Upgrades)

Every contract we ship is a UUPS upgradeable proxy. Storage layout mistakes = loss of all user data.

**Before every upgrade:**
```bash
cd foundry
forge inspect <ContractName> storage-layout > before.json
# make changes
forge inspect <ContractName> storage-layout > after.json
diff before.json after.json
```

Rules:
- New variables append at END only
- Never reorder
- Never insert in middle
- Never rename (doesn't change layout but hides bugs)
- Never delete (doesn't free slot, breaks assumptions)
- If a variable is no longer used, mark `DEPRECATED` in comment, leave in place
- Constants (`uint256 public constant`) don't occupy storage — safe to add/remove
- Always include `uint256[50] __gap` at end of new contracts for future append room

**Contract size check before every deploy:**
```bash
forge build --sizes | grep <ContractName>
```
Limit is 24,576 bytes. `PizzaPartyV2Upgradeable` is currently ~22,719 bytes (after referral removal).

---

## Pre-Deployment Checklist

1. `forge inspect <Contract> storage-layout > before.json`
2. Make changes
3. `forge inspect <Contract> storage-layout > after.json && diff before.json after.json` → only appends, no reorders
4. `forge build --sizes | grep <Contract>` → under 24,576 bytes
5. `forge test` → passing
6. Verify NO unlimited approvals introduced
7. Verify ALL free-reward functions use `backendSigner` pattern
8. Verify ALL caller-supplied amounts validated against dynamic caps
9. Deploy + verify on Sourcify (NOT Basescan unless necessary — see "--verify exposes source")
10. Check token approvals post-deploy
11. Update `docs/contracts/<ContractName>.md` with new implementation address + changes
12. Test the flow end-to-end in the app

---

## Monitoring & Alerts

**`/api/cron/monitor-dumpers`** runs every 4 hours:
- Checks PIZZA balance of all known dumper wallets
- Farcaster notification to owner (FID 1013491) when:
  - Any wallet goes to zero
  - Total remaining drops below 50M PIZZA
  - tomdoecrypto moves ANY PIZZA (ban destination wallet)

**Ban list:** `app/lib/constants/banList.ts`
- Banned wallets: all CTA buttons disabled, removed from settlement
- Known banned: exploit attacker `0xd5af...`, tomdoecrypto (`0x982b`, `0xdb12`, `0xf70d`, `0xe209`), LP bot network (EIP-7702 wallets), siadude (6 wallets), parlor abusers

---

## Known Attack Vectors (History)

### 1. ShareAndSpin Sybil Exploit — April 5, 2026
- **Attacker:** `0xd5af1246946e9183bab39d37127eaf5fa8e5fb27`
- **Method:** Deployed factory contract that spawned 120 micro-contracts in one transaction. Each called `recordShare()` as a unique `msg.sender`, bypassing per-address daily limit.
- **Loss:** ~492,000 PIZZA (~$29) from treasury
- **Root cause:** No EOA check on `recordShare` — allowed contract callers
- **Discovery path:** `--verify` auto-published source to Blockscout within 13s of deployment; `approve(max)` 30 minutes later was visible to monitoring bots
- **Fixes deployed:**
  - Backend signer on `recordShare`, `recordShareSpin`, `claimFreeSlice`, `saveFreeSlice`, `claimPendingSlice`, `giftFreeSlice`
  - Backend signer on `claimSlice`, `redeemSlice` (ParlorManager)
  - EOA check on `recordSpin` (Staking)
  - `onlyOwner` on `settleDailyGameWithUsd`, `settleWeeklyGameWithUsd`
  - Treasury approval capped at 1M PIZZA
  - Staking rewards approval capped at 500M PIZZA
  - Dumper monitor cron live
- **Lesson:** Any function that distributes free value must use backend signer. Public source is visible within seconds. Treasury approvals must be capped.

### 2. Staking Storage Corruption — April 2, 2026
- **Cause:** Inserted `committedSpinOutcome` mapping in the MIDDLE of state variables during an upgrade. Slot collision shifted all subsequent slots, zeroing out every staker's position.
- **Impact:** All 44 stakers showed 0 balance temporarily
- **Fix:** Moved `committedSpinOutcome` to the END of storage (new implementation `0x0e6daba58B910A4dBc0bcE6637dede623Ca8BF94`)
- **Lesson:** NEVER insert storage variables in the middle. Always append. Always diff `storage-layout` before deploying.

### 3. Jackpot Payout Bug — April 7, 2026
- **Cause:** `claimAfterSpin()` called `_claimAllRewards(msg.sender, false)` — `applySpin=false` skipped the entire spin multiplier block. `restake()` used `_calculateTotalPendingRewards()` which assumed 1x and no jackpot. Both functions ignored the committed spin outcome.
- **Impact:** Users who spun Jackpot got 1x + tier bonuses instead of 4x + 10M PIZZA bonus. At least two winners needed manual compensation (~10.7M PIZZA + ~10M PIZZA).
- **Fix:** `claimAfterSpin` now passes `applySpin=true`. `restake` was rewritten to use committed outcome and split extras from `stakingRewardsWallet`. New implementation `0xe69734BeCEcD6D02D66B2E841BC25013dBE00D56`.
- **Lesson:** Reward math must be consistent across ALL claim paths. Do not branch on `applySpin` — always apply the committed outcome. Test every path end-to-end before deploy.

### 4. Stale RPC Outcome Bug — April 2026
- **Cause:** Frontend read `committedSpinOutcome(user)` via `eth_call` right after tx confirmation. Some RPC nodes served stale state from before the block was indexed, returning YESTERDAY'S outcome. User spun RegularSlice but UI showed JACKPOT from yesterday.
- **Fix:** Switched frontend to parse the `SpinRecorded` event from the transaction receipt (always consistent with the mined block). New implementation `0xe26142D4f6c87FD7d3925A85F08028FFd339F1B1`.
- **Lesson:** Reading from contract state after a write is not reliable across RPC nodes. Parse event logs from the receipt for same-tx reads.

### 5. MAX_STAKE Raise — April 2026
- **Change:** Raised from 10B to 20B PIZZA per wallet to accommodate VMF's 3.6B stake growth
- **Deployed:** `0xe26142D4f6c87FD7d3925A85F08028FFd339F1B1`
- No security implication beyond confirming per-wallet cap still applies

---

## Current Contract Access Control (verified on-chain)

**This is the ACTUAL state, not the ideal state. Gaps are called out.**

| Contract | Ownable | Pausable | ReentrancyGuard |
|---|---|---|---|
| PizzaPartyV2 | 1-step `OwnableUpgradeable` | **NO `whenNotPaused` anywhere** | Yes |
| PizzaStakingV1 | 1-step `OwnableUpgradeable` | Yes (9 usages) | Yes |
| PizzaParlorManager | 1-step `OwnableUpgradeable` | **NO** | Yes |
| ShareAndSpin | 1-step `OwnableUpgradeable` | Yes | Yes |

**Known gaps vs. ideal:**
- **No contracts use `Ownable2StepUpgradeable`.** Owner transfer is 1-step; compromise of owner key = instant takeover. Should migrate to Ownable2Step in next upgrade cycle.
- **PizzaParty and ParlorManager have no Pausable.** If exploited, no emergency freeze available — full redeploy required. Should add in next upgrade cycle.
- **`_disableInitializers()` audit (verified by grep):**
  - PizzaPartyV2 ✅ has it
  - **PizzaStakingV1 ❌ MISSING** — raw implementation could be initialized by attacker
  - PizzaParlorManager ✅ has it
  - **ShareAndSpin ❌ MISSING** — raw implementation could be initialized by attacker
  - PizzaChat ✅ has it
  - StickerRegistry ✅ has it
  - **Risk:** attacker calls `initialize()` directly on the implementation contract (not proxy), becomes "owner" of the useless impl. Low impact because impl has no state our proxy uses, but creates confusion and could be used in phishing ("you're the owner now, send ETH here"). Worth fixing in next upgrade.

## Required Modules for Every New Upgradeable Contract

```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MyContract is
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();  // prevents init of raw implementation
    }

    function initialize(address _owner) external initializer {
        __Ownable_init(_owner);
        __Ownable2Step_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ...

    uint256[50] private __gap; // reserve slots for future append-only additions
}
```

Requirements enforced by this template:
- **UUPS** — our upgrade pattern
- **Ownable2Step** — owner transfer is 2-tx, prevents instant hostile takeover
- **Pausable** — emergency freeze without requiring a full upgrade under pressure
- **ReentrancyGuard** — protects all external state-changing functions
- **SafeERC20** — reverts on token transfer failure (never silent fail)
- **`_disableInitializers()`** — closes the "anyone can init the implementation" footgun
- **`__gap[50]`** — reserves 50 slots at the end for safe future appends

---

## Environment Gotchas

- `.env` file has `&` characters in values — parsers break with `source`. Use `grep ^VARNAME= .env | cut -d= -f2` to extract keys.
- Base RPC `mainnet.base.org` rate-limits aggressively. All API routes using viem need fallback transport with at least 3 endpoints (`mainnet.base.org`, `base-rpc.publicnode.com`, `base.meowrpc.com`) with 15s timeouts.
- Foundry compile is slow (~10-20 min with `via_ir = true` on 124 files). This is normal.

---

## Key Rotation Procedure

If any key is suspected compromised:

1. **Backend signer (Vercel EOA):**
   - Pause affected contract: `pause()` via owner wallet
   - Deploy new EOA, fund with gas
   - Call `adminSetBackendSigner(newAddress)` on every contract that uses it (ShareAndSpin, ParlorManager, future TippingVault)
   - Update `BACKEND_SIGNER_PRIVATE_KEY` in Vercel env
   - Redeploy Vercel app
   - Unpause contracts

2. **Owner wallet (`0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC`):**
   - Call `transferOwnership(newOwner)` on every contract (Ownable2Step requires recipient to `acceptOwnership()`)
   - Monitor for 24h before removing old key from cold storage
   - Any compromised key that has NOT yet called `transferOwnership` should be frontrun

3. **`AUTO_SETTLE_PRIVATE_KEY` (cron runner, currently same as owner):**
   - Rotate together with owner wallet since they're the same key
   - Long-term TODO: split these into separate keys

---

## Off-Limits

- **Do not skip hooks** with `--no-verify` unless explicitly asked
- **Do not force push to main**
- **Do not `git add .` or `git add -A`** — always add specific files to avoid committing `.env` or secrets
- **Do not run scripts that contain raw private keys** — always use env vars
- **Do not deploy with `--verify` to Basescan if you want to keep source private** — use Sourcify alone for 1-verification-path strategy
