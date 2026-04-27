# PIZZA Token (Clanker-deployed ERC20)

**NOT our contract — deployed by Clanker.** We have no upgrade authority.

**Last verified on-chain: April 23, 2026**

## Addresses

| | Address |
|---|---|
| PIZZA token (current, 100B supply) | `0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07` |
| PIZZA token (old, game contract) | `0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69` — **deprecated** |

## On-Chain Facts (verified live)

| | Value |
|---|---|
| `totalSupply` | ~98.67B PIZZA (started at 100B) |
| Treasury balance | ~25.85B PIZZA |
| Staking rewards wallet balance | ~12.94B PIZZA |
| Owner wallet balance | ~13.47B PIZZA |
| Allowance treasury → ShareAndSpin | ~19,431 PIZZA (**near zero — needs top-up**) |
| Allowance stakingRewards wallet → Staking | ~189.9M PIZZA (well below 500M cap) |

## Purpose

Standard ERC20 token deployed by Clanker. LP is locked by Clanker. We interact with it as a regular ERC20 — there's no special logic we control.

## Important Features

- **Standard ERC20** — `balanceOf`, `transfer`, `transferFrom`, `approve`, `allowance`
- **`permit`** (EIP-2612) — enables `enterDailyGameWithPermit` (no separate approve tx)
- **`burn(amount)`** — exists (ParlorManager uses it to burn 50% of parlor sale price)
- No upgrade mechanism (NOT our contract to upgrade)

## Policies We Enforce

### Approval Caps (per `docs/SECURITY.md`)

| From | To | Cap | Current Allowance | Status |
|---|---|---|---|---|
| Treasury | ShareAndSpin | 1M PIZZA cap | ~19,431 PIZZA | **LOW — top up soon** |
| Staking rewards wallet | Staking | 500M PIZZA cap | ~189.9M PIZZA | OK |

**Approval scripts:**
- `foundry/script/ApproveTreasuryForShareAndSpin.s.sol`
- `foundry/script/CapStakingRewardsApproval.s.sol`

**Re-run periodically** when allowances get near zero.

### Wallets We Track

| Wallet | Purpose |
|---|---|
| Treasury `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292` | Funds free slices, share rewards, weekly bonuses |
| Staking rewards `0x0b30b1D9327979D290b49BbfEF92f783fdE81c56` | Pays staking extras (APY, bonuses, jackpot) |
| Owner `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` | Admin + general funds |
| Backend signer `0x528952ae107198011C2a1df8c05A82702D5778D6` | EOA for backend-signer functions (holds ~0 PIZZA, only ETH for gas) |

### Known Dumper Wallets

See `app/lib/constants/banList.ts` and `docs/SECURITY.md` for the full list. Monitored by `/api/cron/monitor-dumpers` every 4 hours.

## Integration Patterns

- **`safeTransfer`** — always use OpenZeppelin's SafeERC20, never raw `transfer` (it can silently fail on non-standard tokens; PIZZA is standard but SafeERC20 costs nothing extra)
- **`safeTransferFrom`** — used by staking to pull extras from rewards wallet, by ShareAndSpin to pull from treasury, etc.
- **`permit`** — used in `enterDailyGameWithPermit` to merge approve + enter into one tx

## Files

- Token is NOT in our repo — interacted with via ABI only
- ABI snippet: `app/lib/constants/index.tsx` (`PIZZA_TOKEN_ABI`)
- Approval scripts: `foundry/script/ApproveTreasuryForShareAndSpin.s.sol`, `foundry/script/CapStakingRewardsApproval.s.sol`
