# Pizza Party QR Stickers — Geotagging Feature

Standalone marketing feature at `/sticker`. Users find physical Pizza Party QR stickers in the world, photograph them, and pin them on a global map. Live and public on every page CTA.

## Flow

1. User taps **PIZZA STICKERS** button (visible on every page)
2. Lands on `/sticker` — default tab is **SCAN**
3. User taps **Take Photo** → camera opens (`<input capture="environment">`)
4. Photo runs through 3-layer verification cascade
5. If verified, photo uploads to Pinata IPFS
6. Browser geolocation API gets lat/lng
7. Nominatim reverse-geocodes to city/country/business
8. Find saved to Postgres via Prisma
9. If wallet connected, optional **Record On-Chain** button writes to `StickerRegistryUpgradeable` on Base
10. New find appears on the world map (React Leaflet)

## Verification Cascade (3 layers)

The user's photo MUST contain a valid Pizza Party QR sticker. We never trust the photo blindly.

### Layer 1 — Client `BarcodeDetector` (fastest path)
- `app/sticker/components/StickerScanner.tsx`
- Browsers with the API (Chrome on Android, recent iOS Safari) decode the QR client-side before upload
- If decoded URL matches `VALID_QR_URLS`, sent as `clientDecodedUrl` formData field → instant pass on the server
- Gracefully skipped on browsers without the API

### Layer 2 — Server strict (visual sticker matching)
- `app/api/sticker/upload/route.ts` — `verifyStickerInPhoto(buffer)`
- Pre-downscales image to 1500px max dimension
- Slides crops at scales `[0.10, 0.15, 0.20, 0.30, 0.50, 1.0]` of min image dimension
- For each crop computes:
  - **QR pattern density** (B/W edge transitions per pixel via 150x150 grayscale + adaptive threshold)
  - **Color signature** (red, redLoose, black, white pixel ratios via 80x80 sample)
- **Strict match rules:**
  - Red sticker: `density >= 0.07 AND red >= 0.15 AND black >= 0.04`
  - B&W sticker: `density >= 0.07 AND black >= 0.15 AND white >= 0.30 AND red < 0.08`
- Score = `density × (color_strength)`. Early-exit if score >= 0.05.

### Layer 3 — Server loose (sun-faded fallback)
- Same scan with looser red threshold: `r > 100 && r > g*1.15 && r > b*1.15`
- Catches sun-washed/dim outdoor sticker photos
- Triggered only if strict found nothing

### Tested results
| Photo | Result |
|---|---|
| 4 reference sticker PNGs | All PASS |
| Real-world train window (sun-faded) | PASS via loose layer (~2.4s) |
| Real-world Echo Park lake | PASS via strict layer |
| Real-world pizza shop counter | PASS via strict layer |
| Real-world selfie + sticker | PASS via strict layer |
| Hand photo / random objects | FAIL |
| logo.png, pepperoni-art.png, mushroom-icon2.png | FAIL |

Runtime: 100ms–3s per photo. Vercel `maxDuration = 30`.

### Approved QR target URLs
```ts
const VALID_QR_URLS = [
  'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party',
  'https://pizza-party-game.vmfcoin.com',
  'https://pizza-party-game.vmfcoin.com/',
]
```

### Reference sticker images
Located in `public/images/`:
- `pizza-party-qr.png` — colorful red, links to vmfcoin.com
- `pizza_party_BW_qr.png` — black & white, links to farcaster miniapp
- `pizzaparty.com-qr.png` — red variant, links to vmfcoin.com
- `pizza_party_BW_vmfcoin_qr.png` — black & white, links to vmfcoin.com (generated via `scripts/generate-qr.mjs`)

## Files

| File | Purpose |
|---|---|
| `app/sticker/page.tsx` | Main page with tabs (Scan, Map, Search, Board, Stats), pepperoni card layout |
| `app/sticker/components/StickerScanner.tsx` | Camera flow → client BarcodeDetector → upload → location → save |
| `app/sticker/components/StickerMap.tsx` | React Leaflet map + `InvalidateSizeFix` for hidden-tab rendering |
| `app/sticker/components/StickerGallery.tsx` | Top 20 recent finds, click flies map to location |
| `app/sticker/components/StickerLeaderboard.tsx` | Ranked finders with medals |
| `app/sticker/components/StickerStats.tsx` | DB + on-chain stats |
| `app/sticker/components/StickerSearch.tsx` | Search city / country / business |
| `app/sticker/lib/stickerRegistryAbi.ts` | Contract ABI + address from env |
| `app/api/sticker/upload/route.ts` | 3-layer verification + Pinata upload |
| `app/api/sticker/report/route.ts` | POST create find, PATCH update txHash |
| `app/api/sticker/finds/route.ts` | GET finds with optional search |
| `app/api/sticker/leaderboard/route.ts` | Top 20 finders + global stats |
| `foundry/src/StickerRegistryUpgradeable.sol` | UUPS upgradeable contract |
| `foundry/script/DeployStickerRegistry.s.sol` | Foundry deploy script |

## Database (Prisma)

```prisma
model StickerFind {
  id            String   @id @default(cuid())
  latitude      Float
  longitude     Float
  city          String?
  address       String?
  businessName  String?
  country       String?
  imageUrl      String
  finderAddress String?
  finderFid     Int?
  finderName    String?
  txHash        String?
  createdAt     DateTime @default(now())
  @@index([finderAddress])
  @@index([finderFid])
  @@index([city])
  @@index([country])
  @@index([createdAt])
}
```

## On-Chain Contract

`StickerRegistryUpgradeable` — UUPS proxy on Base mainnet at **`0xba3e4db29efd1d6499B70fe672Fb08FC9B62FeDD`**

Stores `(finder, lat × 1e6, lng × 1e6, city, timestamp)`. Purely optional — only triggered when wallet is connected and user clicks **Record On-Chain** after a successful save. Photo URL is NOT stored on-chain (too expensive).

Functions: `recordFind`, `totalFinds`, `uniqueFinders`, `getFindById`, `getRecentFinds`, `getFinderFindCount`. Storage uses `uint256[43] private __gap` for upgrade safety.

## CTA Button Pattern

On every page (home, daily, weekly, staking, leaderboard, parlor):
- **PIZZA STICKERS** — red bg, QR icons (0.9em) on left/right of text, links to `/sticker`. **Public** — no access gate.
- **PIZZA CHAT** — red bg, pizza emojis on left/right, links to `/chat`. **Gated** to FID 1013491 + associated wallets via `hasEarlyAccess()` from `app/lib/constants/earlyAccess.ts`.

The two buttons sit in a `flex gap-2` row beneath **Spin & Stake**.

## Tech Stack

- **Map:** React Leaflet + OpenStreetMap tiles (free, no API key). Pizza logo markers (40x40).
- **Map fix:** `InvalidateSizeFix` calls `map.invalidateSize()` at 100/300/600ms after the map tab becomes visible (map renders inside hidden div initially since SCAN is the default).
- **Geolocation:** `navigator.geolocation.getCurrentPosition` (OS prompts for permission).
- **Reverse Geocoding:** OpenStreetMap Nominatim with `User-Agent: PizzaPartyStickers/1.0`.
- **Database:** Prisma / PostgreSQL (Neon).
- **Image Storage:** Pinata IPFS via JWT auth (`PINATA_JWT` env var).
- **Image Processing:** `sharp` for resize/crop/grayscale during verification.
- **Client QR:** Native `BarcodeDetector` API (no library — built into browser).

## Environment Variables

| Var | Purpose | Format |
|---|---|---|
| `PINATA_JWT` | Pinata API auth for IPFS upload | `KEY=value` (NOT `KEY: value` — colon format breaks `process.env`) |
| `NEXT_PUBLIC_STICKER_REGISTRY_ADDRESS` | On-chain contract address | `0xba3e4db29efd1d6499B70fe672Fb08FC9B62FeDD` |
| `DATABASE_URL` | Postgres connection | Standard Prisma format |

`PINATA_JWT` must be set on Vercel for Production, Preview, and Development environments.

## Page Layout

`app/sticker/page.tsx`:
- Outer: pizza wallpaper background → `max-w-md` (448px) container with `p-5`
- Card: `p-6`, pepperoni background image, `border-4 red-800 rounded-3xl`
- Inside: `pizza_stickers.png` banner image (cropped to ~3.8:1 ratio)
- "Pizza Rewards Added Soon!" banner
- Tab navigation: SCAN (default), MAP, SEARCH, BOARD, STATS
- Same nav buttons as home page (GRAB A SLICE, CLAIM TOPPINGS, LEADERBOARD, OWN A PARLOR, Spin & Stake) plus PIZZA STICKERS / PIZZA CHAT row

## Open Items

- Real Pizza Rewards system not yet built (banner is in place)
- The 4 reference stickers cover all currently-printed designs. New sticker designs need to be added to `public/images/` AND the verification thresholds may need re-tuning.

## Lessons Learned (don't repeat)

1. **jsQR / qr-scanner / ZXing** all fail on real-world photos of artistic colorful QR codes. Don't try to QR-decode the photo as the verification gate. Use the decoded URL as a *fast path* (Layer 1) but never rely on it.
2. **Perceptual hashing** alone is too lenient (a hand photo passed by matching color profile only). Always require *both* QR pattern density AND color signature in the same crop region.
3. **Pre-downscale** the image to 1500px max before scanning. Real phone photos are 4032x3024 — full-resolution scanning wastes seconds with no accuracy gain.
4. **Vercel default `maxDuration` is 10s.** Set `export const maxDuration = 30` on any route doing image processing.
5. **`.env` parser is strict.** `PINATA_JWT: value` (with colon) makes `process.env.PINATA_JWT` undefined — use `=` always.
