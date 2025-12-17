import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Neynar API for Farcaster user search
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/user/search'

interface NeynarUser {
  fid: number
  username: string
  display_name: string
  pfp_url: string
  custody_address: string
  verified_addresses: {
    eth_addresses: string[]
    sol_addresses: string[]
  }
}

interface NeynarSearchResponse {
  result: {
    users: NeynarUser[]
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query || query.length < 1) {
    return NextResponse.json({
      success: false,
      error: 'Query parameter "q" is required',
      users: [],
    }, { status: 400 })
  }

  const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY

  if (!apiKey) {
    console.error('NEYNAR_API_KEY not configured')
    return NextResponse.json({
      success: false,
      error: 'Search service not configured',
      users: [],
    }, { status: 500 })
  }

  try {
    const response = await fetch(`${NEYNAR_API_URL}?q=${encodeURIComponent(query)}&limit=10`, {
      headers: {
        'accept': 'application/json',
        'api_key': apiKey,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Neynar API error:', response.status, errorText)
      throw new Error(`Neynar API error: ${response.status}`)
    }

    const data: NeynarSearchResponse = await response.json()

    // Transform to simpler format with resolved wallet address
    const users = data.result.users.map(user => {
      // Prefer verified ETH address, fallback to custody address
      const walletAddress = user.verified_addresses?.eth_addresses?.[0] || user.custody_address

      return {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        walletAddress,
      }
    }).filter(user => user.walletAddress) // Only return users with valid addresses

    return NextResponse.json({
      success: true,
      users,
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
