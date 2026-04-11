# Pizza Party Game — CLAUDE.md

## CRITICAL RULES — NEVER VIOLATE

1. **NEVER commit or expose private keys** — no .env contents, no wallet keys, no seed phrases. EVER.
2. **NEVER run commands containing private keys** — only the user deploys contracts and runs Foundry scripts.
3. **NEVER hardcode values** — all parameters must have admin setter functions. Nothing hardcoded in contracts.
4. **NEVER reorder, insert, rename, or delete storage variables** in upgradeable contracts. New vars append at the END only.
5. **NEVER use unlimited token approvals** — always cap approvals. Re-run approval scripts to top up.
6. **NEVER make free-reward functions permissionless** — functions that give out free tokens/rewards/entries from treasury MUST use the backend signer pattern (dedicated EOA on Vercel calls the contract after API-level verification). Until migrated, all such functions MUST have `require(tx.origin == msg.sender)` as minimum defense.
7. **NEVER trust caller-supplied amounts without validation** — any function pulling from treasury must validate against a dynamic cap (e.g., `holdingsUnitPizza * 2`).
8. **NEVER rely on "unannounced" for security** — deploying with `--verify` publishes full source instantly. Bots read it within seconds. All security must be in the code itself.

## Contract Security (Post-April 2026 Exploit)

### Backend Signer Pattern (Target Architecture)
All functions giving free value must migrate to:
1. Player interacts via Vercel frontend
2. API verifies player (captcha, FID, Neynar cast verification)
3. Backend signer wallet (dedicated EOA, `BACKEND_SIGNER_PRIVATE_KEY` on Vercel) calls contract
4. Contract only accepts calls from `backendSigner` address
5. Include `adminSetBackendSigner(address)` for key rotation

### Approval Caps (Current)
- Treasury → ShareAndSpin: 1M PIZZA (was unlimited)
- Staking rewards wallet → Staking: 500M PIZZA (was unlimited)
- Re-run approval scripts periodically to top up

### Monitoring
- `/api/cron/monitor-dumpers` runs every 4 hours, alerts via Farcaster when dumper wallets empty

## Contract Size Constraint

PizzaPartyV2Upgradeable is at **~22,719 bytes** (limit: 24,576) after referral removal.
- Before ANY contract change: `forge inspect PizzaPartyV2Upgradeable storage-layout > before.json`
- After ANY contract change: `forge inspect PizzaPartyV2Upgradeable storage-layout > after.json` then `diff before.json after.json`
- Check size: `forge build --sizes | grep PizzaPartyV2`
- NEVER add comments or docstrings to the contract just to be helpful — they cost bytes.

## Architecture

- **UUPS upgradeable proxies** for all contracts (PizzaParty, Staking, ParlorManager, ShareAndSpin)
- **Foundry** for Solidity compile/test/deploy scripts
- **Next.js** frontend deployed on Vercel
- **Farcaster miniapp** — uses `@farcaster/miniapp-sdk`
- **Base L2** chain (chain ID 8453)
- `.env` has parse errors with `&` chars — use `grep` to extract keys, never `source`

## Contract Addresses (Base Mainnet)

| Contract | Proxy | Latest Implementation |
|---|---|---|
| PizzaParty | `0xA1C31c3eF1448351da0b1D430148660982B6f3dD` | `0x1acd623D75f6a9DD3DcE7D6eEB9b16c80Ecb3135` |
| Staking | `0xCbAf5bACe5419710C3852653d3DdEB831d7415be` | — |
| ParlorManager | `0x7acfaa1dadd836404a8d90b49581758c4fdc889b` | — |
| ShareAndSpin | `0xE45be9456E9da420f85CE69D5F0Ca96Ffe035b5C` | `0xf94D7f285Eb22085Dfbf10282093c73Bd550D6C7` |
| PIZZA Token | `0xa821f2ee19F4f62e404C934D43eB6E5763fbdb07` | — |
| Owner Wallet | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` | — |
| Treasury | `0xBfCA21E41D397C8B6beF0c348D394DA2c4826292` | — |

---

## Share & Spin (ACTIVE — replacing referral system)

### Overview
Players share a composeCast on Farcaster, verify via Neynar API, then earn rewards and spin a wheel. This is a **separate UUPS upgradeable contract** (`ShareAndSpinUpgradeable`), NOT on PizzaParty. PizzaParty has a bridge function to add toppings.

### Flow
1. Player clicks SHARE & SPIN on daily game page
2. `sdk.actions.composeCast()` opens — player posts on Farcaster (stays in-app, never leaves)
3. Player taps VERIFY & SPIN
4. Backend calls `/api/share/verify-cast` — Neynar confirms cast exists, correct FID, has embed, is recent
5. Backend signer calls `recordShare(player, claimedReward)` on ShareAndSpin contract
   - Pays ~$0.01 PIZZA from treasury via `safeTransferFrom`
   - Adds 1 topping to PizzaParty via `addToppingsFromShareAndSpin(player, 1)`
   - Frontend passes `claimedReward`, contract validates `<= 2x shareRewardAmount`
6. Backend signer calls `recordShareSpin(player, castHashBytes32)` on ShareAndSpin contract
   - Wheel spin with 3 outcomes: Nothing (94%) / Free Slice (5%) / Gold (1%)
   - Outcome read from `ShareSpinRecorded` event in tx receipt (never contract state)
7. Wheel animation plays (3s, tick sounds, haptics)
8. Result screen shows with post-spin composeCast share option

### Spin Outcomes

| Outcome | Odds | Roll Range | Reward |
|---|---|---|---|
| Nothing | 94% | 0-939 | Just the $0.01 PIZZA + 1 topping from step 5 |
| Free Slice | 5% | 940-989 | Free entry into daily game ($1 PIZZA from treasury) |
| Gold | 1% | 990-999 | Real pizza IRL + free slice + owner notified |

### Gold Rules
- Capped at **1 per weekly game** globally (`shareSpinGoldAwardedWeekId`)
- If Gold already hit this week, downgraded to Free Slice
- Resets automatically when `weeklyGameId` increments (Monday noon Pacific)

### Share Limits
- **1 share per daily game** — tracked by `lastShareGameId[player]`
- **3 shares per week** — tracked by `weeklySharesUsed[weekId][player]`
- **Cast hash dedup** — `usedCastHashes[hash]` prevents reuse

### Free Slice Options (when player already entered today)
- **Send to a friend** — Farcaster username search, `giftFreeSlice(player, recipient, entryFee)`
- **Save for tomorrow** — `saveFreeSlice(player)`, claim next game via `claimPendingSlice(player, entryFee)`

### Price Oracle
- `shareRewardAmount` set by `adminSetShareRewardAmount(amount)`
- Calculated: `floor($0.01 / pizzaPriceUsd * 1e18)`
- Updated on same schedule as staking's `adminSetPizzaPrice()`
- Script: `foundry/script/SetShareRewardAmount.s.sol`

### ShareAndSpin Contract Storage Layout
| Slot | Variable | Type |
|---|---|---|
| 0 | pizzaToken | IERC20 |
| 1 | pizzaParty | IPizzaPartyForShare |
| 2 | treasuryWallet | address |
| 3 | playerLastShareTimestamp | mapping(address => uint256) |
| 4 | shareRewardAmount | uint256 |
| 5 | shareSpinGoldAwardedWeekId | uint256 |
| 6 | shareSpinNonce | uint256 (private) |
| 7 | weeklySharesUsed | mapping(uint256 => mapping(address => uint256)) |
| 8 | usedCastHashes | mapping(bytes32 => bool) |
| 9 | lastShareGameId | mapping(address => uint256) |
| 10 | playerShareToppings | mapping(address => uint256) |
| 11 | backendSigner | address |
| 12 | hasFreeSlice | mapping(address => bool) |
| 13 | pendingFreeSlice | mapping(address => bool) |

### PizzaParty Bridge (slot 31)
- `address public shareAndSpinContract` — slot 31, appended after `parlorFeeBPS` at slot 30
- `addToppingsFromShareAndSpin(player, amount)` — only callable by ShareAndSpin contract
- `enterDailyFromShareAndSpin(player, entryFee)` — enters player into daily game, treasury pays

### Security (Post-Exploit Hardening)
- **Backend signer pattern** — all write functions require `msg.sender == backendSigner`
- **Entry fee validation** — `_validateEntryFee()` checks `entryFee <= holdingsUnitPizza * 2`
- **Reward validation** — `claimedReward <= shareRewardAmount * 2`
- **Cast verification** — Neynar API confirms FID, embed URL, cast age (<10 min)
- **Cast dedup** — same cast hash cannot be used twice
- **Treasury approval capped** — 1M PIZZA cap, not unlimited
- **Ban list** — `app/lib/constants/banList.ts` blocks known exploiters
- **FID gating** — currently limited to test FIDs: 1013491, 392134, 2182791, 200506, 792821

### Wheel Visual Mapping (8 slices, 45 degrees each)
Pointer at 12 o'clock. Gold star at top-right.
```
Slice 0: GOLD       → contract outcome 2
Slice 1: TRY AGAIN  → contract outcome 0
Slice 2: FREE SLICE → contract outcome 1
Slice 3: TRY AGAIN  → contract outcome 0
Slice 4: FREE SLICE → contract outcome 1
Slice 5: TRY AGAIN  → contract outcome 0
Slice 6: FREE SLICE → contract outcome 1
Slice 7: TRY AGAIN  → contract outcome 0
```
Code mapping: `Gold: [0], Free Slice: [2, 4, 6], Nothing: [1, 3, 5, 7]`

### Wheel Assets
- **Ring:** `/public/images/Pizza-Ring.png` (260x260, static, z-10 on top)
- **Wheel:** `/public/images/Share & Spin_Wheel.png` (232x232, rotates inside ring)
- **Tick sound:** `/public/sounds/pizza-tick.mp3`
- Animation: 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)

### Post-Spin ComposeCast Messages (optional share after result)

**Nothing:**
```
I just spun the Pizza Wheel 🍕
Didn't hit the big one this time… but I still walked away with free $PIZZA and a topping just for sharing 😏
That topping goes straight into my weekly jackpot odds too… so every spin is building something bigger.
This game really pays you to show up.
```

**Free Slice:**
```
Just landed a FREE SLICE on the Pizza Wheel 🍕🔥
Stacked some $PIZZA, grabbed a topping, and boosted my weekly odds all in one spin
Every time I play it feels like I'm leveling up my chances
This thing really adds up fast
```

**Gold:**
```
Just spun the GOLD SLICE 🏆🍕
Got real pizza IRL, $PIZZA rewards, and stacked toppings all from one play
Started with a simple share and ended up hitting big
Not gonna lie… this game actually pays people to play 😳🔥
```

### Files Involved
| File | Purpose |
|---|---|
| `foundry/src/ShareAndSpinUpgradeable.sol` | ShareAndSpin contract |
| `foundry/src/PizzaPartyV2Upgradeable.sol` | Bridge functions + referral removal |
| `foundry/test/ShareAndSpin.t.sol` | Comprehensive tests |
| `app/lib/constants/index.tsx` | ABI + addresses for ShareAndSpin |
| `app/api/share/verify-cast/route.ts` | Neynar cast verification |
| `app/api/share/record/route.ts` | DB record + gold winner alerts |
| `app/components/game/ShareAndSpinModal.tsx` | Full modal UI + wheel animation |
| `app/components/game/index.tsx` | Share & Spin button (FID-gated) |
| `app/components/ToppingBreakdownModal.tsx` | "Share & Spin" replaces "Referrals" |
| `app/components/WeeklyJackpotPage.tsx` | Reads share toppings from contract |

### What Was Removed (Referral System)
- `_processReferral()` call removed from `enterDailyGame` and `enterDailyGameWithPermit`
- `createReferralCode()` body replaced with revert
- `_processReferral()`, `_generateCode()`, `_getReferrerFromCode()` bodies emptied
- Storage mappings (`playerReferralCode`, `codeToPlayer`, `hasUsedReferral`) LEFT IN PLACE — never deleted
- Frontend: referral code display, share buttons, first-time modal, URL param parsing — all removed
- `getReferralCode()` reads removed from `useGamePageData.tsx`
- `app/ref/[code]/page.tsx` → redirect to `/`
- Toppings breakdown: "Referrals" → "Share & Spin"

### Deploy Scripts
| Script | Purpose |
|---|---|
| `UpgradePizzaPartyShareAndSpin.s.sol` | Upgrade PizzaParty with bridge + disable referrals |
| `DeployShareAndSpin.s.sol` | Deploy ShareAndSpin proxy + wire to PizzaParty |
| `UpgradeShareAndSpin.s.sol` | Upgrade with price validation |
| `UpgradeShareAndSpinFreeSlice.s.sol` | Add claimFreeSlice |
| `UpgradeShareAndSpinGiftSave.s.sol` | Add gift/save free slice |
| `UpgradePizzaPartyFreeSlice.s.sol` | Add enterDailyFromShareAndSpin |
| `ApproveTreasuryForShareAndSpin.s.sol` | Treasury approval (capped 1M PIZZA) |
| `SetShareRewardAmount.s.sol` | Update $0.01 reward to current price |

### Deployment Checklist
```
[x] PizzaParty upgraded (bridge + referrals disabled)
[x] ShareAndSpin deployed (proxy)
[x] ShareAndSpin upgraded (price validation)
[x] ShareAndSpin upgraded (free slice claim)
[x] ShareAndSpin upgraded (gift/save free slice)
[x] PizzaParty upgraded (enterDailyFromShareAndSpin)
[x] PizzaParty → ShareAndSpin wired
[x] Treasury approval (1M PIZZA cap)
[x] shareRewardAmount set
[x] All contracts verified on Sourcify
[x] Frontend: ShareAndSpinModal created
[x] Frontend: referral UI removed
[x] Frontend: FID-gated to test users
[x] Frontend: toppings breakdown updated
[x] API: verify-cast route with Neynar
[x] API: record route with gold alerts
[ ] Price oracle: add adminSetShareRewardAmount to bot
[ ] Full public launch (remove FID gate)
```

---

## Referral System (DISABLED — replaced by Share & Spin)

Referral functions are disabled on-chain. Storage slots preserved. See Share & Spin section above.

---

## Existing Systems (Unchanged)

### Settlement Flow
- 80% to winners, 10% to stakers, 7% to parlors, 3% to veteran charities
- Banned players removed before settlement via `adminFixDailyGamePlayers`
- USD value snapshot at settlement time via `settleDailyGameWithUsd` (onlyOwner)

### DST / Timezone Handling
- `noonPacificUtcHour` on contract controls game end time (19=PDT, 20=PST)
- Cron schedules in vercel.json must match the contract hour

### Cron Jobs (Vercel)
- Daily settle: `/api/cron/settle-game` at 19:01 UTC daily (PDT)
- Weekly settle: `/api/cron/settle-weekly` at 20:03 UTC Mondays
- Dumper monitor: `/api/cron/monitor-dumpers` every 4 hours

### Staking — Spin the Pie
- Separate from Share & Spin — this is the staking reward multiplier
- Outcomes: Regular (73%, 1x), Loaded (20%, 1.1x), Hot (5%, 1.5x), Jackpot (2%, 3x + 10M PIZZA)
- Uses `pizza_wheel.png` asset (different from Share & Spin wheel)
- `recordSpin()` on staking contract, requires `tx.origin == msg.sender`

---

## Security Incident: April 5-9, 2026 (ShareAndSpin Sybil Exploit)

### What Happened
On April 5 at 10:41 UTC, attacker `0xd5af1246946e9183bab39d37127eaf5fa8e5fb27` exploited `recordShare()` on the ShareAndSpin contract. They deployed a factory contract that spawned 120 micro-contracts in one transaction. Each called `recordShare()` as a unique `msg.sender`, bypassing the per-address daily limit. Each received ~4,100 PIZZA from treasury. Total drained: ~492,000 PIZZA (~$29).

### Root Cause
`recordShare()` had no check that the caller was a real wallet (EOA) vs a smart contract. The attacker bypassed per-address limits by using 120 different contract addresses.

### How They Found The Contract
- Foundry `--verify` auto-published full source to Blockscout within 13 seconds of deployment
- Treasury `approve(max)` 30 minutes later was visible on-chain to monitoring bots
- Attacker had 3.7 days between deployment (Apr 1) and exploit (Apr 5)

### Cascade Effects
1. **LP whale exit** — `0x57d5` pulled 5.4B PIZZA from Uniswap LP over 48 hours (~$931)
2. **Arbitrage bot** — tomdoecrypto bought 2.75B for $3.23 during crash, sold 3B for $2,731
3. **LP bot network** — 10 EIP-7702 wallets pulled ~4.5B PIZZA from LP, drip-selling ~200M/day
4. **Price crashed** to ~$21K mcap floor (Clanker locked LP)

### All Fixes Deployed (April 6-8)

| Fix | Contract | Status |
|-----|----------|--------|
| Backend signer on recordShare, recordShareSpin, claimFreeSlice, saveFreeSlice, claimPendingSlice, giftFreeSlice | ShareAndSpin | DEPLOYED |
| Backend signer on claimSlice, redeemSlice | ParlorManager | DEPLOYED |
| EOA check on recordSpin | Staking | DEPLOYED |
| `onlyOwner` on settleDailyGameWithUsd, settleWeeklyGameWithUsd | PizzaParty | DEPLOYED |
| Treasury approval capped at 1M PIZZA | PIZZA Token | DONE |
| Staking rewards approval capped at 500M PIZZA | PIZZA Token | DONE |
| Dumper monitoring cron (every 4 hours) | Vercel | LIVE |
| All exploiter/bot wallets banned | Frontend | DEPLOYED |

### What Was NOT Affected
- No player funds stolen
- No staking positions touched
- No game results changed
- Daily games continued settling normally
- All PIZZA in treasury, staking, and game contracts is safe

---

## Backend Signer Architecture (Deployed)

### How It Works
Instead of players calling reward contracts directly, the Vercel backend calls on their behalf:

```
Player clicks button → Vercel API verifies (FID, Neynar, rate limits) → Backend signer wallet calls contract → Player gets reward
```

### Backend Signer Wallet
- **Address:** `0x528952ae107198011C2a1df8c05A82702D5778D6`
- **Purpose:** Dedicated EOA for calling reward functions. Low-privilege — can ONLY call functions gated by `backendSigner`.
- **Gas:** Funded with ~0.002 ETH on Base. Costs ~$1/month at current usage.
- **Key storage:** `BACKEND_SIGNER_PRIVATE_KEY` env var on Vercel + local `.env`
- **Rotation:** Call `adminSetBackendSigner(newAddress)` on ShareAndSpin + ParlorManager if key is compromised.

### Functions Using Backend Signer (8 total)

| Contract | Function | What It Gives Free |
|----------|----------|--------------------|
| ShareAndSpin | `recordShare(player, reward)` | ~$0.01 PIZZA from treasury |
| ShareAndSpin | `recordShareSpin(player, castHash)` | Spin for free slice / gold |
| ShareAndSpin | `claimFreeSlice(player, entryFee)` | Free game entry from treasury |
| ShareAndSpin | `saveFreeSlice(player)` | Save free slice for tomorrow |
| ShareAndSpin | `claimPendingSlice(player, entryFee)` | Claim saved free slice |
| ShareAndSpin | `giftFreeSlice(player, recipient, entryFee)` | Gift free entry to friend |
| ParlorManager | `claimSlice(player, entryFee)` | Claim parlor slice, treasury pays |
| ParlorManager | `redeemSlice(player, sponsor, ...)` | Redeem signed slice voucher |

### Functions NOT Using Backend Signer (player signs directly)

| Contract | Function | Why Safe |
|----------|----------|----------|
| PizzaParty | `enterDailyGame` | Player pays own PIZZA |
| PizzaParty | `enterDailyGameWithPermit` | Player pays own PIZZA |
| Staking | `stake` / `unstake` | Player's own tokens |
| Staking | `claim` / `restake` | Earns from own stake |
| Staking | `recordSpin` | EOA check, requires stake |
| ParlorManager | `purchaseParlor` | Player pays own PIZZA |
| ParlorManager | `sendSlice` | Parlor owner action |
| ParlorManager | `claimMyFees` | Claims own earned fees |
| PizzaParty | `claimToppings` | Internal accounting only |
| PizzaParty | `settleDailyGame` | Public fallback, no free value |

### API Routes (Backend Signer)

| Route | Purpose |
|-------|---------|
| `POST /api/share/execute` | Calls all 6 ShareAndSpin functions from backend |
| `POST /api/slice/claim-backend` | Calls ParlorManager `claimSlice` from backend |
| `POST /api/share/verify-cast` | Neynar cast verification (called before execute) |

---

## Banned Wallets & Monitoring

### Ban List (`app/lib/constants/banList.ts`)
Banned users can open the app but ALL CTA buttons are disabled. They cannot play, stake, spin, or receive slices.

### Currently Banned

| Actor | FID | Wallets | PIZZA Held | Reason |
|-------|-----|---------|-----------|--------|
| Exploit attacker | — | `0xd5af` | 0 | Sybil exploit, drained 492K PIZZA |
| @tomdoecrypto | 2809448 | `0x982b`, `0xdb12`, `0xf70da978`, `0xe209e004` | 793M | Bought exploit crash for $3.23, sold for $2,731, stake/unstake abuse |
| EIP-7702 bot network | — | `0xc1b1`, `0x8eED`, `0xf7d3`, `0x18D7`, `0x186F`, `0xB23C`, `0x34e8` | 4,044M | LP bot network pulling/selling ~200M/day |
| @siadude | 273708 | 6 wallets | — | Multi-wallet game manipulation |
| Parlor abusers | 1547858, 1548166 | 3 wallets | — | Self-serving abuse |

### Dumper Monitoring (`/api/cron/monitor-dumpers`)
- Runs every 4 hours via Vercel cron
- Checks PIZZA balance of all known dumper wallets
- Sends Farcaster notification to owner (FID 1013491) when:
  - Any wallet goes to zero (dumper finished)
  - Total remaining drops below 50M PIZZA
  - tomdoecrypto moves ANY PIZZA (movement watch — alert to ban destination wallet)

### Known Remaining Sell Pressure (~5.9B PIZZA)

| Wallet | PIZZA | Sell Rate | Est. Empty |
|--------|-------|-----------|------------|
| `0xc1b1` (LP bot main) | 2,215M | ~90M/day | ~3 weeks |
| `0x8eED` (LP bot sibling) | 448M | moderate | ~2 weeks |
| `0xf7d3` (LP bot sub) | 500M | unknown | unknown |
| `0x18D7` (LP bot sub) | 300M | unknown | unknown |
| `0x13181F` (0x57d5 network) | 400M | hasn't sold yet | unknown |
| `0xece081` (0x57d5 network) | 490M | hasn't sold yet | unknown |
| tomdoecrypto | 793M | holding | BANNED |
| Others | ~750M | varies | varies |

All got PIZZA from Uniswap V4 LP removal — legitimate holdings, not from exploit. Cannot be blocked from DEX selling, only from game interaction.

---

## Security Checklist — Before ANY Contract Deployment

1. `forge inspect <Contract> storage-layout > before.json`
2. Make changes
3. `forge inspect <Contract> storage-layout > after.json && diff before.json after.json`
4. `forge build --sizes | grep <Contract>` — verify under 24,576 bytes
5. Verify NO unlimited approvals introduced
6. Verify ALL free-reward functions use `backendSigner` pattern
7. Verify ALL caller-supplied amounts validated against dynamic caps
8. Deploy + verify on Sourcify
9. Check token approvals post-deploy:
   ```bash
   cast call <PIZZA_TOKEN> "allowance(address,address)(uint256)" <WALLET> <CONTRACT> --rpc-url https://mainnet.base.org
   ```
10. Test the flow end-to-end in the app
