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
  {
    fid: 0,
    addresses: [
      '0xd5af1246946e9183bab39d37127eaf5fa8e5fb27',
    ],
    reason: 'ShareAndSpin exploit — drained ~84M PIZZA from treasury via contract sybil attack (2026-04-05)',
  },
  {
    fid: 2809448, // @tomdoecrypto
    addresses: [
      '0xdb12050ac19f24648692cb530c7fc7a4fc2d0e6d', // Farcaster custody
      '0x982b560b649c785a523e08f44079a2979d998a47', // Connected wallet (793M PIZZA, bot trading)
      '0xf70da97812cb96acdf810712aa562db8dfa3dbef', // Whale funder wallet (179 ETH, confirmed same operator via Relay tx params)
      '0xe209e00477ee4a9d0c655e1d24b5f3fbbb2a8a15', // ETH intermediary (funded by 0xf70da978, funded 0x982b)
    ],
    reason: '@tomdoecrypto — bot operator, bought 2.75B PIZZA for $3.23 during exploit crash, sold 3B for $2,731, stake/unstake abuse (30min + 2min cycles)',
  },
  {
    fid: 0, // EIP-7702 LP bot network — 10 wallets, 1 operator, 4B PIZZA
    addresses: [
      '0xc1b1996dfb67a12c58d57b89105db9050c01cbee', // Main wallet (2.2B PIZZA, pulled 3.49B from LP)
      '0x8eedc84e1e69cd9ddfa3da2aa176b9d0bfa0e869', // Sibling bot (448M)
      '0xf7d38cd26f65ea4aad8b197b68273d4e953709f2', // Bot 3 (500M)
      '0x18d700d7da8718c876f6362694bcbb11acd29949', // Bot 4 (300M)
      '0x186ff660dbd2098fcb8bcb29cdeb6c2587fa1490', // Bot 5 (152M)
      '0xb23c2e7046dd449266b533702041e05d45f82610', // Parent/funder EOA (49M, funded 0xc1b1)
      '0x34e836abdbbafc4da915b38a3c69b1585e006558', // Sub-wallet (247M, active seller)
    ],
    reason: 'EIP-7702 LP bot network — pulled 4.5B PIZZA from LP, drip-selling ~200M/day across 10 wallets',
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

/**
 * Slice-Blocked Recipients — users who cannot receive free slices from ANY parlor owner.
 * Unlike a full ban, these users can still play the game normally (pay their own entry).
 * They just can't receive free slices.
 */
export const SLICE_BLOCKED_FIDS = new Set<number>([
  1102870, // @papusiek1111 — repeat pair abuse
  271946,  // @kindkknd — repeat pair abuse
  1300255, // @richieboston — repeat pair abuse
  256858,  // @elonmusic — repeat pair abuse
])

/** Check if a recipient is blocked from receiving any free slices */
export function isSliceBlocked(
  recipientFid: number | null | undefined
): boolean {
  if (!recipientFid) return false
  return SLICE_BLOCKED_FIDS.has(recipientFid)
}

/**
 * Blocked Slice Pairs — specific sender→recipient combinations that are blocked.
 * Use this when you don't want to fully ban either user, but need to stop
 * a specific sender from slicing a specific recipient.
 *
 * The sender is blocked from sending to the recipient. The error message
 * is shown to the sender when they try.
 */
export interface BlockedSlicePair {
  senderFid: number
  recipientFid: number
  reason?: string
}

export const BLOCKED_SLICE_PAIRS: BlockedSlicePair[] = [
  {
    senderFid: 937375,   // @Coolguy Slices (kender7)
    recipientFid: 1102870, // @papusiek1111
    reason: 'Repeat pair abuse flagged',
  },
]

// Pre-built set for O(1) lookup: "senderFid->recipientFid"
const BLOCKED_PAIRS_SET = new Set<string>(
  BLOCKED_SLICE_PAIRS.map(p => `${p.senderFid}->${p.recipientFid}`)
)

/** Check if a specific sender→recipient slice pair is blocked */
export function isSlicePairBlocked(
  senderFid: number | null | undefined,
  recipientFid: number | null | undefined
): boolean {
  if (!senderFid || !recipientFid) return false
  return BLOCKED_PAIRS_SET.has(`${senderFid}->${recipientFid}`)
}
