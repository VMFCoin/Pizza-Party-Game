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
  {
    fid: 273708, // @siadude — primary account
    addresses: [
      '0x9e227a0e1a6c3c649f52451753f16e13d09cf78f', // Custody address (FID 273708)
      '0x3c515f7776f41ffc9df45a4bbd515c85e21aba62', // Verified wallet + custody of FID 943433 (11k txs, won game 80)
      '0x7e2dab6404b71e979829b25715e32e8a3daac422', // Verified wallet (Feeder A, 4,077 txs)
      '0xbe8a4925a08b144fd45e459d0e0a295e632d7c3c', // Verified wallet
      '0xa3b711d0f4d753b9b4b60d0ab6e8931537c0a2c5', // Verified wallet
      '0x4e395d9e49f61bcdd902f174af1f05d72f2e572e', // Verified wallet
    ],
    reason: '@siadude — used multiple wallets to enter game 80, funded via own wallet (Feeder A)',
  },
  {
    fid: 943433, // Ghost account, custody = @siadude verified wallet
    addresses: [],
    reason: 'Throwaway FID registered with @siadude wallet 0x3c51 (addresses covered above)',
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
