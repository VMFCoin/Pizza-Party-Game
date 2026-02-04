import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem, formatUnits, isAddress } from 'viem'
import { base } from 'viem/chains'
import { Redis } from '@upstash/redis'
import { PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants'

export const dynamic = 'force-dynamic'

const redis = Redis.fromEnv()
const CACHE_TTL_SECONDS = 300 // 5 minutes per-user cache

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

const ownerFeesClaimedEvent = parseAbiItem('event OwnerFeesClaimed(address indexed owner, uint256 amount)')
const MAX_BLOCK_RANGE = 49000n

// ParlorManager deployment block (Dec 15, 2024)
const PARLOR_MANAGER_DEPLOY_BLOCK = 39521243n

// Fetch logs in chunks
async function getClaimedTotal(
  owner: `0x${string}`,
  startBlock: bigint,
  endBlock: bigint,
): Promise<bigint> {
  let total = 0n
  let currentFrom = startBlock

  while (currentFrom <= endBlock) {
    const currentTo = currentFrom + MAX_BLOCK_RANGE > endBlock
      ? endBlock
      : currentFrom + MAX_BLOCK_RANGE

    const logs = await publicClient.getLogs({
      address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
      event: ownerFeesClaimedEvent,
      args: { owner },
      fromBlock: currentFrom,
      toBlock: currentTo,
    })

    for (const log of logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total += (log as any).args.amount || 0n
    }
    currentFrom = currentTo + 1n
  }

  return total
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get('address')

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ success: false, error: 'Valid address required' }, { status: 400 })
    }

    const addr = userAddress.toLowerCase()
    const cacheKey = `parlor:lifetime:${addr}`

    // Check cache first
    const cached = await redis.get<{ lifetimeClaimed: string; cachedAt: number }>(cacheKey)
    if (cached) {
      return NextResponse.json({ success: true, ...cached, fromCache: true })
    }

    const currentBlock = await publicClient.getBlockNumber()

    // Fetch all OwnerFeesClaimed events for this user since contract deployment
    const lifetimeClaimedRaw = await getClaimedTotal(
      userAddress as `0x${string}`,
      PARLOR_MANAGER_DEPLOY_BLOCK,
      currentBlock,
    )

    const result = {
      lifetimeClaimed: formatUnits(lifetimeClaimedRaw, 18),
      cachedAt: Date.now(),
    }

    // Cache per-user result
    await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS })

    return NextResponse.json({ success: true, ...result, fromCache: false })
  } catch (error) {
    console.error('Parlor lifetime API error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch lifetime claimed' },
      { status: 500 }
    )
  }
}
