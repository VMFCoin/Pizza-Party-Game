/**
 * Ban List - Users banned from interacting with Pizza Party
 *
 * Banned users can still open and browse the app, but:
 * - ALL CTA buttons are disabled (grayed out, non-clickable)
 * - They cannot receive slices from parlor owners
 *
 * To ban a user, add their FID and ALL known wallet addresses (lowercase).
 */

export interface BannedUser {
  fid: number
  /** All known wallet addresses for this user (lowercase, include custody + all connected wallets) */
  addresses: string[]
  reason?: string
}

export const BANNED_USERS: BannedUser[] = [
  {
    fid: 1547858,
    addresses: [
      '0x3dc73d745f75208caeb61886d68efef30cc22835',
    ],
    reason: 'Parlor self-serving abuse',
  },
  {
    fid: 1548166,
    addresses: [
      '0xf1fffb1f661803958ba7f656484bd6f9294f64d6',
      '0x9a822ed47ea00d9487e63ed3fbe90d4cc45034e0',
    ],
    reason: 'Parlor self-serving abuse',
  },
]

// Pre-built sets for O(1) lookup
const BANNED_FIDS = new Set<number>(BANNED_USERS.map(u => u.fid))
const BANNED_ADDRESSES = new Set<string>(
  BANNED_USERS.flatMap(u => u.addresses.map(a => a.toLowerCase()))
)

/** Check if a FID is banned */
export function isFidBanned(fid: number | null | undefined): boolean {
  if (!fid) return false
  return BANNED_FIDS.has(fid)
}

/** Check if a wallet address belongs to a banned user */
export function isAddressBanned(address: string | null | undefined): boolean {
  if (!address) return false
  return BANNED_ADDRESSES.has(address.toLowerCase())
}

/** Check if a user is banned by FID OR wallet address (for current user check) */
export function isUserBanned(
  fid: number | null | undefined,
  address: string | null | undefined
): boolean {
  return isFidBanned(fid) || isAddressBanned(address)
}

/** Check if a recipient is banned (for blocking slice sends to them) */
export function isRecipientBanned(
  recipientFid: number | null | undefined,
  recipientAddress: string | null | undefined
): boolean {
  return isFidBanned(recipientFid) || isAddressBanned(recipientAddress)
}
