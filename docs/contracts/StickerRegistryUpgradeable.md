# StickerRegistryUpgradeable

On-chain registry of Pizza Sticker finds (the QR-code physical sticker hunt feature).

**Last verified on-chain: 2026-05-31** (backend signer upgrade deployed)

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`
- No Pausable
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor calls `_disableInitializers()`
- Solidity: 0.8.24

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | `0xba3e4db29efd1d6499B70fe672Fb08FC9B62FeDD` |
| Implementation (2026-05-31) | `0x4FA51a50Ccc7D3b7050891621417bEA35f9E097b` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |
| Backend signer | `0x528952ae107198011C2a1df8c05A82702D5778D6` |

## Purpose

Permanent on-chain geotag registry — **no Postgres/Neon required**. Stores:
- Finder wallet
- Coordinates (lat/lng × 1e6)
- City name
- Timestamp

Photo verification happens off-chain; only verified finds are written via backend signer.

## Storage Layout (Append-Only — do not reorder)

- `finds[]` — array of StickerFindRecord
- `finderFinds[addr]` → uint256[]
- `totalFinds` (uint256)
- `uniqueFinders` (uint256)
- `hasFound[addr]` (bool)
- `backendSigner` (address) — **appended in 2026-05-31 upgrade, __gap reduced 43→42**

## Critical Functions

| Function | Caller | Purpose |
|---|---|---|
| `recordFindFor(player, lat, lng, city)` | `backendSigner` only | Record a verified sticker find for a player |
| `adminSetBackendSigner(addr)` | Owner | Rotate backend signer key |

### Views

- `getFinderFindCount(finder)` → uint256
- `getFinderFindIds(finder)` → uint256[]
- `getFindById(id)` → full record
- `getRecentFinds(offset, limit)` → paginated (newest first)

## Events

- `StickerFound(findId, finder, lat, lng, city, timestamp)`

## Security Model

1. Client scans QR → optional `BarcodeDetector` fast path
2. Server visual verification (density + color signature)
3. Backend signer calls `recordFindFor` on Base — players do not pay gas
4. Permissionless `recordFind` **removed** — prevents unverified spam pins

## Integration Points

- **API:** `POST /api/sticker/record` — verify photo + geolocation + backend write
- **API:** `GET /api/sticker/finds` — reads from chain via RPC (no database)
- **Frontend:** `/sticker` map, gallery, leaderboard

## Upgrade

Script: `foundry/script/UpgradeStickerRegistryBackendSigner.s.sol`

```
forge script script/UpgradeStickerRegistryBackendSigner.s.sol --rpc-url $BASE_RPC --broadcast
```

## Files

- `foundry/src/StickerRegistryUpgradeable.sol`
- `foundry/test/StickerRegistry.t.sol`
- `foundry/script/UpgradeStickerRegistryBackendSigner.s.sol`
- `app/lib/stickerVerification.ts`
- `app/lib/stickerOnChain.ts`
- `app/api/sticker/record/route.ts`
- `app/api/sticker/finds/route.ts`
- `app/api/sticker/leaderboard/route.ts`
- `scripts/backfill-sticker-finds.ts` — one-time legacy Neon → on-chain replay
