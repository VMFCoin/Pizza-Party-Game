# Pizza Party Game — CLAUDE.md

## CRITICAL RULES — NEVER VIOLATE

1. **NEVER commit or expose private keys** — no .env contents, no wallet keys, no seed phrases. EVER.
2. **NEVER run commands containing private keys** — only the user deploys contracts and runs Foundry scripts.
3. **NEVER hardcode values** — all parameters must have admin setter functions. Nothing hardcoded in contracts.
4. **NEVER reorder, insert, rename, or delete storage variables** in upgradeable contracts. New vars append at the END only.

## Contract Size Constraint

PizzaPartyV2Upgradeable is at **~24,570 bytes** (limit: 24,576). Every byte counts.
- Before ANY contract change: `forge inspect PizzaPartyV2Upgradeable storage-layout > before.json`
- After ANY contract change: `forge inspect PizzaPartyV2Upgradeable storage-layout > after.json` then `diff before.json after.json`
- Check size: `forge build --sizes | grep PizzaPartyV2`
- If new code doesn't fit: remove dead code first. The referral system removal (~1,240 bytes) creates room.
- NEVER add comments or docstrings to the contract just to be helpful — they cost bytes.

## Architecture

- **UUPS upgradeable proxies** for all contracts (PizzaParty, Staking, ParlorManager)
- **Foundry** for Solidity compile/test/deploy scripts
- **Next.js** frontend deployed on Vercel
- **Farcaster miniapp** — uses `@farcaster/miniapp-sdk`
- **Base L2** chain (chain ID 8453)
- `.env` has parse errors with `&` chars — use `grep` to extract keys, never `source`

## Active Feature: Share & Spin (replacing referral system)

### What it does
Players share a composeCast on Farcaster, verify via Neynar API, then:
- TX1: `recordShare()` on PizzaParty → ~$0.01 PIZZA from treasury + 1 topping
- TX2: `recordShareSpin(castHashBytes32)` on PizzaParty → wheel spin (Nothing 89% / Free Slice 10% / Gold 1%)

### Storage layout (slots 31-34, appended after parlorFeeBPS at slot 30)
- `playerLastShareTimestamp` — mapping(address => uint256) — slot 31
- `shareRewardAmount` — uint256 — slot 32
- `shareSpinGoldAwardedGameId` — uint256 — slot 33
- `shareSpinNonce` — uint256 (private) — slot 34

### Key constraints
- 1 share per day (24h cooldown), 3 per week (reuses `referralsUsed` field in `PlayerWeekly`)
- Gold capped at 1 winner per daily game globally (`shareSpinGoldAwardedGameId`)
- Gold downgraded to FreeSlice if already awarded that day
- Treasury must approve PizzaParty contract once: `pizza.approve(address(this), max)`
- `shareRewardAmount` set by price oracle bot (same cadence as `adminSetPizzaPrice`)
- Frontend reads spin outcome from tx receipt events, NEVER from contract state (stale RPC risk)
- `composeCast` called WITHOUT `close:true` — app stays open, user never leaves

### Files involved
- `foundry/src/PizzaPartyV2Upgradeable.sol` — contract changes (Steps A-F)
- `app/lib/constants/index.tsx` — ABI additions
- `app/api/share/verify-cast/route.ts` — Neynar cast verification
- `app/api/share/record/route.ts` — DB record + gold winner alerts
- `app/components/game/ShareAndSpinModal.tsx` — full modal UI
- `app/components/game/index.tsx` — integration (replace referral card)
- `app/lib/useGamePageData.tsx` — remove referral reads
- `foundry/test/ShareAndSpin.t.sol` — comprehensive tests

### What gets removed (referral system)
- `_processReferral()` call removed from `enterDailyGame`
- `createReferralCode()` and `useReferralCode()` bodies replaced with revert
- `_processReferral()`, `_generateCode()`, `_getReferrerFromCode()` bodies emptied
- Storage mappings (`playerReferralCode`, `codeToPlayer`, `hasUsedReferral`) LEFT IN PLACE — never deleted
- Frontend: referral code display, share buttons, first-time modal, URL param parsing — all removed
- `app/ref/[code]/page.tsx` → redirect to `/`

### Deployment order (zero downtime)
1. Storage layout check (before.json)
2. Deploy new implementation + upgrade
3. Storage layout verify (after.json diff)
4. Treasury approval (one-time)
5. Set initial shareRewardAmount
6. Deploy API routes
7. Deploy frontend
8. Frame cleanup
9. Price oracle update
10. Run tests
