import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Neynar API for checking if an address belongs to a FID
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster'
const NEYNAR_API_KEY = 'NEYNAR_API_DOCS'

/**
 * Check if a wallet address belongs to a specific Farcaster user (FID)
 * This is used to prevent parlor owners from sending free slices to their own wallets
 * (e.g., sending from their primary Farcaster address to their Coinbase smart wallet)
 *
 * Query params:
 * - address: The wallet address to check
 * - fid: The Farcaster ID to check against
 *
 * Returns:
 * - belongsToFid: true if the address is verified by the given FID
 * - ownerFid: the FID that owns this address (if any)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const address = searchParams.get('address')?.toLowerCase().trim()
  const fidParam = searchParams.get('fid')

  if (!address || !fidParam) {
    return NextResponse.json({
      success: false,
      error: 'Both "address" and "fid" query parameters are required',
    }, { status: 400 })
  }

  const targetFid = parseInt(fidParam, 10)
  if (isNaN(targetFid)) {
    return NextResponse.json({
      success: false,
      error: 'Invalid FID format',
    }, { status: 400 })
  }

  try {
    // Look up which Farcaster user owns this address
    const response = await fetch(
      `${NEYNAR_API_URL}/user/bulk-by-address?addresses=${encodeURIComponent(address)}`,
      {
        headers: { 'api_key': NEYNAR_API_KEY },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      // Address not found or API error - assume no ownership
      return NextResponse.json({
        success: true,
        belongsToFid: false,
        ownerFid: null,
        message: 'Address not linked to any Farcaster account',
      })
    }

    const data = await response.json()

    // The API returns { [address]: [user1, user2, ...] }
    // Usually there's only one user per address
    const users = data[address] || data[address.toLowerCase()] || []

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        belongsToFid: false,
        ownerFid: null,
        message: 'Address not linked to any Farcaster account',
      })
    }

    // Check if any of the users owning this address match the target FID
    const matchingUser = users.find((user: { fid: number }) => user.fid === targetFid)
    const ownerFid = users[0]?.fid || null

    return NextResponse.json({
      success: true,
      belongsToFid: !!matchingUser,
      ownerFid,
      ownerUsername: users[0]?.username || null,
    })

  } catch (error) {
    console.error('Check ownership error:', error)
    // On error, return false to not block the transaction
    // The contract will still enforce the NoSelfSlice check for same-address
    return NextResponse.json({
      success: true,
      belongsToFid: false,
      ownerFid: null,
      error: 'Failed to verify ownership',
    })
  }
}
