# StickerRegistryUpgradeable

On-chain registry of Pizza Sticker finds (the QR-code physical sticker hunt feature).

**Last verified on-chain: April 23, 2026**

## As Deployed (exact current state)

- Inherits: `OwnableUpgradeable`, `UUPSUpgradeable`
- No Pausable
- Owner: `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` (1-step transfer)
- Constructor calls `_disableInitializers()`
- Solidity: 0.8.24

## Addresses (Base Mainnet)

| | Address |
|---|---|
| Proxy | Deployed — see `foundry/broadcast/DeployStickerRegistry.s.sol/8453/run-latest.json` |
| Owner | `0xd9EF10D1dB272A5105557AAfc571e7BF66c95CEC` |

## Purpose

Records sticker finds:
- Finder wallet
- Coordinates (lat/lng)
- Timestamp
- Sticker ID

Used to display the map of where stickers have been scanned, and gate features to stickers physically found (geotagging feature).

## Storage Layout (Append-Only — do not reorder)

- `finds[]` — array of Find struct (finder, lat, lng, timestamp, stickerId, notes, metadata)
- `finderFinds[addr]` → uint256[] — find IDs per finder
- `totalFinds` (uint256)
- `uniqueFinders` (uint256)
- `hasFound[addr]` — first-find dedup

## Critical Functions

### User-facing

| Function | Caller | Purpose |
|---|---|---|
| `recordFind(lat, lng, stickerId, notes, metadata)` | Anyone | Record a sticker find. Validates coordinates (lat ∈ [-90,90], lng ∈ [-180,180]). Emits `StickerFound` event. |

### Views

- `getFinderFindCount(finder)` → uint256
- `getFinderFindIds(finder)` → uint256[]
- `getFindById(id)` → full Find struct
- `getRecentFinds(offset, limit)` → paginated recent finds

## Events

- `StickerFound(finder, findId, lat, lng, stickerId, timestamp, notes, metadata)`

## Security Model

The on-chain contract itself does NOT verify the sticker is real. Verification happens **off-chain before calling `recordFind`**:

1. Client scans QR → BarcodeDetector confirms format
2. Server-side strict verification: density + color check
3. Server-side loose fallback verification
4. Only after all 3 layers pass → client calls `recordFind`

See `docs/share-and-spin-implementation.md` for the sticker system details, or `app/api/sticker/` for the verification endpoints.

## Invariants

- Latitude ∈ [-90, 90] × 1e6 scale
- Longitude ∈ [-180, 180] × 1e6 scale
- `hasFound[finder]` set on first record → used to count `uniqueFinders`

## Integration Points

- **← Frontend:** sticker page calls `recordFind` after 3-layer verification
- **← API:** sticker verification routes at `app/api/sticker/*`

## Files

- `foundry/src/StickerRegistryUpgradeable.sol` (167 lines)
- Deploy script: `foundry/script/DeployStickerRegistry.s.sol`
- Frontend: sticker hunt page, map view
