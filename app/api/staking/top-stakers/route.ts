import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { createPublicClient, http, formatUnits } from 'viem'
import { base } from 'viem/chains'

const PIZZA_STAKING_ADDRESS = '0xCbAf5bACe5419710C3852653d3DdEB831d7415be'

// Minimal ABI for getStakeInfo
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

// Helper for JSON responses with CORS
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return json({ ok: true })
}

export async function GET() {
  try {
    // Get all staking positions from database (FID -> wallet mapping)
    const stakingPositions = await prisma.stakingPosition.findMany({
      select: {
        fid: true,
        wallet: true,
      }
    })

    if (stakingPositions.length === 0) {
      return json({ topStakers: [] })
    }

    // Create public client to read from contract
    const client = createPublicClient({
      chain: base,
      transport: http(),
    })

    // Fetch on-chain stake info for each wallet
    const stakerData = await Promise.all(
      stakingPositions.map(async (position) => {
        try {
          const stakeInfo = await client.readContract({
            address: PIZZA_STAKING_ADDRESS,
            abi: STAKING_ABI,
            functionName: 'getStakeInfo',
            args: [position.wallet as `0x${string}`],
          })

          return {
            fid: position.fid,
            wallet: position.wallet,
            totalStaked: stakeInfo[0],
            flexibleAmount: stakeInfo[1],
            lockedAmount: stakeInfo[2],
            tier: stakeInfo[3],
          }
        } catch (err) {
          console.error(`Failed to get stake info for ${position.wallet}:`, err)
          return null
        }
      })
    )

    // Filter out null results and stakers with 0 stake
    const validStakers = stakerData.filter(
      (s): s is NonNullable<typeof s> => s !== null && s.totalStaked > 0n
    )

    // Sort by total staked (descending) and take top 20
    validStakers.sort((a, b) => (b.totalStaked > a.totalStaked ? 1 : -1))
    const top20 = validStakers.slice(0, 20)

    // Fetch Farcaster profiles for the top stakers
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY

    const profiles: Record<number, { username?: string; displayName?: string; pfpUrl?: string }> = {}

    if (NEYNAR_API_KEY && top20.length > 0) {
      try {
        const fids = top20.map(s => s.fid).join(',')
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids}`,
          {
            headers: {
              api_key: NEYNAR_API_KEY,
            },
          }
        )

        if (response.ok) {
          const data = await response.json()
          for (const user of data.users || []) {
            profiles[user.fid] = {
              username: user.username,
              displayName: user.display_name,
              pfpUrl: user.pfp_url,
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch Farcaster profiles:', err)
      }
    }

    // Build response
    const topStakers = top20.map((staker, index) => ({
      rank: index + 1,
      fid: staker.fid,
      wallet: staker.wallet,
      totalStaked: formatUnits(staker.totalStaked, 18),
      totalStakedRaw: staker.totalStaked.toString(),
      flexibleAmount: formatUnits(staker.flexibleAmount, 18),
      lockedAmount: formatUnits(staker.lockedAmount, 18),
      tier: staker.tier,
      username: profiles[staker.fid]?.username,
      displayName: profiles[staker.fid]?.displayName,
      pfpUrl: profiles[staker.fid]?.pfpUrl,
    }))

    return json({ topStakers })
  } catch (error) {
    console.error('[Top Stakers API] Error:', error)
    return json({ error: 'Failed to fetch top stakers' }, 500)
  }
}
