// Tipping is PUBLIC. Anyone with a valid FID can tip.
//
// Players still must:
//   - Be staked (≥ $1 PIZZA) — enforced upstream by the staking contract
//   - Have a tip balance — funded by clicking the purple TIP button after a spin
//   - Reply to a Farcaster cast with `1000 🍕` / `1000 $pizza` / `1,000 🍕` etc.
//
// The list below is kept ONLY for legacy backend/webhook compatibility checks
// and historic reference. It does NOT gate tipping anymore.
export const TIP_ALLOWLIST_FIDS: number[] = [
  2182791,
  392134,
  200506,
  792821,
  1013491,
]

/**
 * Returns true if the FID is allowed to tip.
 * After public launch, this returns true for any non-null FID.
 */
export function canTip(fid: number | null | undefined): boolean {
  if (fid == null) return false
  if (fid <= 0) return false
  return true
}
