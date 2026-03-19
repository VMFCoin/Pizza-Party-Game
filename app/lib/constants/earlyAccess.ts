// Early access gate for features still in testing
// Only these FIDs/wallets can see gated UI elements
export const EARLY_ACCESS_FID = 1013491
export const EARLY_ACCESS_WALLETS = [
  '0x2c38a83a1361c84b31379426b3cf1d2f1b01f774',
  '0x257cbe89968495c3ae8c81bccb8be7f257cd5f66',
]

export function hasEarlyAccess(fid: number | null | undefined, walletAddress: string | null | undefined): boolean {
  if (fid === EARLY_ACCESS_FID) return true
  if (walletAddress && EARLY_ACCESS_WALLETS.includes(walletAddress.toLowerCase())) return true
  return false
}
