import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Neynar API for proper primary address resolution
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster'
// Using the public docs API key - works for basic lookups
const NEYNAR_API_KEY = 'NEYNAR_API_DOCS'

// Fallback: Farcaster Hub API
const HUB_URL = 'https://hub.pinata.cloud/v1'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  // Strip leading @ if present (users type @mike but API expects mike)
  const rawQuery = searchParams.get('q')?.toLowerCase().trim() || ''
  const query = rawQuery.startsWith('@') ? rawQuery.slice(1) : rawQuery

  if (!query || query.length < 1) {
    return NextResponse.json({
      success: false,
      error: 'Query parameter "q" is required',
      users: [],
    }, { status: 400 })
  }

  try {
    // Try Neynar API first - it has proper primary address support
    const neynarRes = await fetch(
      `${NEYNAR_API_URL}/user/search?q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: { 'api_key': NEYNAR_API_KEY },
        cache: 'no-store',
      }
    )

    if (neynarRes.ok) {
      const neynarData = await neynarRes.json()
      const users = neynarData.result?.users || []

      // Find exact username match
      const exactMatch = users.find(
        (u: { username: string }) => u.username.toLowerCase() === query
      )

      if (exactMatch) {
        // Get the PRIMARY verified ETH address from Neynar
        const primaryEth = exactMatch.verified_addresses?.primary?.eth_address
        // Fallback to first verified address if no primary
        const firstVerified = exactMatch.verified_addresses?.eth_addresses?.[0]
        // Last resort: custody address
        const custodyAddress = exactMatch.custody_address

        const walletAddress = primaryEth || firstVerified || custodyAddress

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
            fid: exactMatch.fid,
            username: exactMatch.username,
            displayName: exactMatch.display_name || exactMatch.username,
            pfpUrl: exactMatch.pfp_url || '',
            walletAddress,
          }],
          query,
        })
      }
    }

    // Fallback to Hub API if Neynar fails or no match
    const usernameRes = await fetch(
      `${HUB_URL}/userNameProofByName?name=${encodeURIComponent(query)}`,
      { cache: 'no-store' }
    )

    if (!usernameRes.ok) {
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

    // Try to get user data from Neynar by FID for primary address
    const neynarByFidRes = await fetch(
      `${NEYNAR_API_URL}/user/bulk?fids=${fid}`,
      {
        headers: { 'api_key': NEYNAR_API_KEY },
        cache: 'no-store',
      }
    )

    if (neynarByFidRes.ok) {
      const neynarByFidData = await neynarByFidRes.json()
      const user = neynarByFidData.users?.[0]

      if (user) {
        const primaryEth = user.verified_addresses?.primary?.eth_address
        const firstVerified = user.verified_addresses?.eth_addresses?.[0]
        const custodyAddress = user.custody_address
        const walletAddress = primaryEth || firstVerified || custodyAddress

        if (walletAddress) {
          return NextResponse.json({
            success: true,
            users: [{
              fid: user.fid,
              username: user.username,
              displayName: user.display_name || user.username,
              pfpUrl: user.pfp_url || '',
              walletAddress,
            }],
            query,
          })
        }
      }
    }

    // Last fallback: Hub API for user data
    const [userDataRes, verificationRes] = await Promise.all([
      fetch(`${HUB_URL}/userDataByFid?fid=${fid}`, { cache: 'no-store' }),
      fetch(`${HUB_URL}/verificationsByFid?fid=${fid}`, { cache: 'no-store' }),
    ])

    let pfpUrl = ''
    let displayName = query

    if (userDataRes.ok) {
      const userData = await userDataRes.json()
      const messages = userData.messages || []

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

    // Get first ETH verification from Hub as last resort
    let walletAddress = ''
    if (verificationRes.ok) {
      const verificationData = await verificationRes.json()
      const verifications = verificationData.messages || []

      for (const v of verifications) {
        const body = v.data?.verificationAddAddressBody
        const addr = body?.address
        const protocol = body?.protocol

        if (addr && addr.startsWith('0x') && addr.length === 42 &&
            (!protocol || protocol === 'PROTOCOL_ETHEREUM')) {
          walletAddress = addr
          break
        }
      }
    }

    // Fallback to custody address
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
