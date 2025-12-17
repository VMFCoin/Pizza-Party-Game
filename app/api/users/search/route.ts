import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Farcaster Hub API - free, no API key required
// Using Neynar's public hub or official hubs
const HUB_URL = 'https://hub.pinata.cloud/v1'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.toLowerCase().trim()

  if (!query || query.length < 1) {
    return NextResponse.json({
      success: false,
      error: 'Query parameter "q" is required',
      users: [],
    }, { status: 400 })
  }

  try {
    // Step 1: Look up username to get FID
    const usernameRes = await fetch(
      `${HUB_URL}/userNameProofByName?name=${encodeURIComponent(query)}`,
      { cache: 'no-store' }
    )

    if (!usernameRes.ok) {
      // Username not found - return empty (not an error)
      return NextResponse.json({
        success: true,
        users: [],
        query,
        message: 'No exact match found. Try the full username.',
      })
    }

    const usernameData = await usernameRes.json()
    const fid = usernameData.fid

    if (!fid) {
      return NextResponse.json({
        success: true,
        users: [],
        query,
      })
    }

    // Step 2: Get all user data and verifications
    // The Hub API returns all user data types in a messages array
    const [userDataRes, verificationRes] = await Promise.all([
      fetch(`${HUB_URL}/userDataByFid?fid=${fid}`, { cache: 'no-store' }), // All user data
      fetch(`${HUB_URL}/verificationsByFid?fid=${fid}`, { cache: 'no-store' }), // Verifications (wallets)
    ])

    let pfpUrl = ''
    let displayName = query

    if (userDataRes.ok) {
      const userData = await userDataRes.json()
      const messages = userData.messages || []

      // Find PFP and display name from the messages array
      for (const msg of messages) {
        const dataType = msg.data?.userDataBody?.type
        const value = msg.data?.userDataBody?.value

        if (dataType === 'USER_DATA_TYPE_PFP' && value) {
          pfpUrl = value
        } else if (dataType === 'USER_DATA_TYPE_DISPLAY' && value) {
          displayName = value
        }
      }
    }

    // Get verified ETH address
    let walletAddress = ''
    if (verificationRes.ok) {
      const verificationData = await verificationRes.json()
      const verifications = verificationData.messages || []

      // Find first ETH verification
      for (const v of verifications) {
        const addr = v.data?.verificationAddAddressBody?.address
        if (addr && addr.startsWith('0x') && addr.length === 42) {
          walletAddress = addr
          break
        }
      }
    }

    // If no verified address, try to get custody address from the username proof
    if (!walletAddress && usernameData.owner) {
      walletAddress = usernameData.owner
    }

    if (!walletAddress) {
      return NextResponse.json({
        success: true,
        users: [],
        query,
        message: 'User found but no wallet address linked.',
      })
    }

    return NextResponse.json({
      success: true,
      users: [{
        fid,
        username: query,
        displayName,
        pfpUrl,
        walletAddress,
      }],
      query,
    })

  } catch (error) {
    console.error('User search error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search users',
      users: [],
    }, { status: 500 })
  }
}
