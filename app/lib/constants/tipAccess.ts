// FID allowlist for the new Tipping Vault feature.
//
// Public can SEE the [ TIP ] button but the click does nothing for non-allowlisted FIDs.
// Allowlisted FIDs get the full flow: claim-to-tip, cast-to-tip, withdraw.
//
// Remove this gate (or set canTip to always true) when going public.
export const TIP_ALLOWLIST_FIDS: number[] = [
  2182791,
  392134,
  200506,
  792821,
  1013491,
]

export function canTip(fid: number | null | undefined): boolean {
  if (fid == null) return false
  return TIP_ALLOWLIST_FIDS.includes(fid)
}
