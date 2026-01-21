import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const PIZZA_STAKING_ADDRESS = '0xCbAf5bACe5419710C3852653d3DdEB831d7415be'

// ABI for getStakeInfo
const STAKING_ABI = [
  {
    type: 'function',
    name: 'getStakeInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'user' }],
    outputs: [
      { type: 'uint256', name: 'totalStakedAmount' },
      { type: 'uint256', name: 'flexibleAmount' },
      { type: 'uint256', name: 'lockedAmount' },
      { type: 'uint8', name: 'tier' },
      { type: 'uint256', name: 'lockEndTimestamp' },
      { type: 'uint256', name: 'totalPendingRewards' },
      { type: 'bool', name: 'isEarlyBoostActive' }
    ]
  }
] as const

// Create public client
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
})

// Helper for JSON responses
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return json({ ok: true })
}

// POST /api/staking/update-staker - Update a single staker's data after stake/unstake
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const wallet = body.wallet?.toLowerCase()

    if (!wallet || !/^0x[a-f0-9]{40}$/i.test(wallet)) {
      return json({ error: 'Invalid wallet address' }, 400)
    }

    // Get current stake info from blockchain
    const stakeInfo = await publicClient.readContract({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'getStakeInfo',
      args: [wallet as `0x${string}`],
    })

    const totalStaked = stakeInfo[0]

    if (totalStaked === 0n) {
      // User unstaked completely - remove from database
      await prisma.staker.deleteMany({ where: { wallet } })
      return json({ success: true, action: 'removed', wallet })
    }

    // Fetch Farcaster profile
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY
    let profile: { fid?: number; username?: string; displayName?: string; pfpUrl?: string } = {}

    if (NEYNAR_API_KEY) {
      try {
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${wallet}`,
          { headers: { api_key: NEYNAR_API_KEY } }
        )

        if (response.ok) {
          const data = await response.json()
          const users = data[wallet]
          if (users && users.length > 0) {
            const user = users[0]
            profile = {
              fid: user.fid,
              username: user.username,
              displayName: user.display_name,
              pfpUrl: user.pfp_url,
            }
          }
        }
      } catch (err) {
        console.error('[Update Staker] Error fetching Farcaster profile:', err)
      }
    }

    // Upsert staker in database
    await prisma.staker.upsert({
      where: { wallet },
      create: {
        wallet,
        totalStaked: totalStaked.toString(),
        flexibleAmount: stakeInfo[1].toString(),
        lockedAmount: stakeInfo[2].toString(),
        tier: stakeInfo[3],
        fid: profile.fid,
        username: profile.username,
        displayName: profile.displayName,
        pfpUrl: profile.pfpUrl,
      },
      update: {
        totalStaked: totalStaked.toString(),
        flexibleAmount: stakeInfo[1].toString(),
        lockedAmount: stakeInfo[2].toString(),
        tier: stakeInfo[3],
        fid: profile.fid,
        username: profile.username,
        displayName: profile.displayName,
        pfpUrl: profile.pfpUrl,
      },
    })

    return json({ success: true, action: 'updated', wallet })
  } catch (error) {
    console.error('[Update Staker] Error:', error)
    return json({ error: 'Failed to update staker' }, 500)
  }
}
