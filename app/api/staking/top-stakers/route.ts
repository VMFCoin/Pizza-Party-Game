import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { formatUnits } from 'viem'

// Helper for JSON responses with CORS
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return json({ ok: true })
}

// GET /api/staking/top-stakers - Get top 20 stakers from database (fast!)
export async function GET() {
  try {
    // Query top 20 stakers from database, sorted by totalStaked descending
    // Note: totalStaked is stored as string, so we need to sort as numeric
    const stakers = await prisma.staker.findMany({
      orderBy: {
        updatedAt: 'desc', // Fallback ordering
      },
      take: 100, // Get more than 20 so we can sort properly
    })

    // Sort by totalStaked (as BigInt) and take top 20
    const sortedStakers = stakers
      .map(s => ({
        ...s,
        totalStakedBigInt: BigInt(s.totalStaked),
      }))
      .sort((a, b) => (b.totalStakedBigInt > a.totalStakedBigInt ? 1 : -1))
      .slice(0, 20)

    // Build response
    const topStakers = sortedStakers.map((staker, index) => ({
      rank: index + 1,
      wallet: staker.wallet,
      totalStaked: formatUnits(staker.totalStakedBigInt, 18),
      totalStakedRaw: staker.totalStaked,
      flexibleAmount: formatUnits(BigInt(staker.flexibleAmount), 18),
      lockedAmount: formatUnits(BigInt(staker.lockedAmount), 18),
      tier: staker.tier,
      fid: staker.fid,
      username: staker.username,
      displayName: staker.displayName,
      pfpUrl: staker.pfpUrl,
    }))

    return json({ topStakers })
  } catch (error) {
    console.error('[Top Stakers API] Error:', error)
    return json({ error: 'Failed to fetch top stakers' }, 500)
  }
}
