# Share & Spin — Implementation Plan

## Status: PRE-IMPLEMENTATION (docs + safety guardrails created)

---

## Contract Size Budget (the #1 risk)

```
CURRENT STATE
  PizzaPartyV2Upgradeable deployed size: 24,570 bytes
  EVM limit:                             24,576 bytes
  Headroom:                                   6 bytes  ← CANNOT add anything as-is

AFTER REMOVING REFERRAL CODE (Step F + body removals)
  _generateCode()        ~400 bytes  (loops, string ops — heaviest)
  _getReferrerFromCode() ~180 bytes
  _processReferral()     ~350 bytes
  createReferralCode()   ~200 bytes  (replaced with 1-line revert)
  getReferralCode()       ~60 bytes  (can remove entirely — dead code)
  getPlayerFromCode()     ~50 bytes  (can remove entirely — dead code)
  Estimated freed:      ~1,240 bytes

AFTER ADDING SHARE & SPIN (Steps A-D)
  recordShare()          ~300 bytes
  recordShareSpin()      ~350 bytes
  getShareInfo()         ~100 bytes
  adminSetShareRewardAmount() ~50 bytes
  ShareSpinOutcome enum   ~20 bytes
  3 events                ~80 bytes  (selector only — no runtime cost)
  Estimated added:       ~900 bytes

NET CHANGE:  -1,240 + 900 = ~-340 bytes freed
PROJECTED:   24,570 - 340 = ~24,230 bytes (346 bytes headroom)

⚠️  These are estimates. MUST verify with forge build --sizes after edits.
     If it doesn't fit, shorten revert strings first ("Referrals replaced by Share and Spin" → "deprecated").
```

---

## Storage Layout (verified via forge inspect)

```
EXISTING (slots 0-30, DO NOT TOUCH):
  Slot 0:  pizzaToken (address)
  Slot 1:  treasuryWallet (address)
  Slot 2:  charityWallets (address[])
  Slot 3:  ownerFeeBPS (uint256)
  Slot 4:  ownerFeeRecipient (address)
  Slot 5:  noonPacificUtcHour (uint256)
  Slot 6:  dailyGameId (uint256)
  Slot 7:  weeklyGameId (uint256)
  Slot 8:  currentDailyPot (uint256)
  Slot 9:  holdingsUnitPizza (uint256)
  Slot 10: dailyGames mapping
  Slot 11: weeklyGames mapping
  Slot 12: hasPlayedDaily mapping
  Slot 13: weeklyPlayers mapping  ← contains referralsUsed (repurposed as sharesUsed)
  Slot 14: playerStats mapping
  Slot 15: playerReferralCode mapping  ← KEEP, stop writing
  Slot 16: codeToPlayer mapping        ← KEEP, stop writing
  Slot 17: hasUsedReferral mapping     ← KEEP, stop writing
  Slot 18: dailyGameUsdValue mapping
  Slot 19: weeklyGameUsdValue mapping
  Slot 20: parlorManager (address)
  Slot 21: dailySliceSponsor mapping
  Slot 22: firstSliceSponsor mapping   ← DEPRECATED
  Slot 23: firstClaimWeekId mapping    ← DEPRECATED
  Slot 24: hasSlicedPlayer mapping
  Slot 25: weeklySliceSponsor mapping
  Slot 26: toppingUnitPizza (uint256)
  Slot 27: weeklyTreasuryBonus (uint256)
  Slot 28: stakingContract (address)
  Slot 29: stakingFeeBPS (uint256)
  Slot 30: parlorFeeBPS (uint256)       ← LAST EXISTING

NEW (slots 31-34, appended):
  Slot 31: playerLastShareTimestamp mapping(address => uint256)
  Slot 32: shareRewardAmount uint256
  Slot 33: shareSpinGoldAwardedGameId uint256
  Slot 34: shareSpinNonce uint256 (private)
```

---

## Implementation Steps (in order)

### Phase 1: Contract (must be perfect — no second chances on-chain)

```
□ 1.1  Save storage layout before: forge inspect ... > before.json
□ 1.2  STEP A: Append 4 storage vars after parlorFeeBPS
□ 1.3  STEP B: Add 3 events
□ 1.4  STEP C: Add ShareSpinOutcome enum
□ 1.5  STEP D: Add 4 functions (recordShare, recordShareSpin, getShareInfo, adminSetShareRewardAmount)
□ 1.6  STEP E: Edit enterDailyGame (remove _processReferral call, comment param)
□ 1.7  STEP F: Replace referral function bodies (createReferralCode → revert, etc.)
□ 1.8  Remove dead referral internal functions (_generateCode, _getReferrerFromCode, _processReferral bodies)
□ 1.9  Save storage layout after: forge inspect ... > after.json
□ 1.10 diff before.json after.json — ONLY 4 new slots at bottom
□ 1.11 forge build --sizes — must be under 24,576 bytes
□ 1.12 forge test --match-contract ShareAndSpinTest --fork-url https://mainnet.base.org -vvv
```

### Phase 2: Backend API Routes

```
□ 2.1  Create app/api/share/verify-cast/route.ts
□ 2.2  Create app/api/share/record/route.ts
□ 2.3  Wire DB client (uncomment db lines, add shareRecords table)
□ 2.4  Set VMFCOIN_FID to actual FID
□ 2.5  Add NEYNAR_SIGNER_UUID to .env
```

### Phase 3: Frontend

```
□ 3.1  Add ABI entries to constants/index.tsx
□ 3.2  Create app/components/game/ShareAndSpinModal.tsx
□ 3.3  Update game/index.tsx (replace referral card, add modal)
□ 3.4  Update useGamePageData.tsx (remove referral reads)
□ 3.5  Replace app/ref/[code]/page.tsx with redirect
□ 3.6  Update app/api/frame/route.ts (remove referral state)
□ 3.7  Add wheel image: /public/images/share_spin_wheel.png
```

### Phase 4: Oracle + Deploy

```
□ 4.1  Add adminSetShareRewardAmount to price oracle bot
□ 4.2  Deploy contract (user runs Foundry script)
□ 4.3  Treasury approval (user runs from treasury wallet)
□ 4.4  Set initial shareRewardAmount
□ 4.5  Deploy frontend to Vercel
□ 4.6  End-to-end test on production
```

---

## Open Questions (answered)

**Q: Does referralsUsed reset each week?**
A: YES — it's in PlayerWeekly struct, keyed by weeklyGameId. New week = fresh struct = 0.

**Q: Should frontend pass "" for referralCode?**
A: YES — existing code already passes "" when no code entered. The commented-out param name (`/*referralCode*/`) means Solidity ignores it. Zero frontend changes needed for enterDailyGame.

**Q: Does useReferralCode() exist on the current contract?**
A: NO — there is no function with that exact name. The spec's Step F for useReferralCode may need to be skipped or adapted. Verify by searching the contract.

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Storage slot collision | before/after diff — abort if anything moves |
| Contract too large | Remove referral code first, check size, then add |
| Treasury drained | shareRewardAmount set by admin only, starts at 0 |
| Cast spam | 1/day + 3/week caps on-chain, Neynar verify off-chain |
| Gold abuse | Once per game day globally, on-chain enforcement |
| RPC stale state | Read spin outcome from tx receipt, never contract state |
| composeCast exits app | close NOT set — stays in-app (verified pattern from parlor slice) |
| Rollback needed | shareRewardAmount=0 = shares pay nothing, frontend revert = 2 files |
