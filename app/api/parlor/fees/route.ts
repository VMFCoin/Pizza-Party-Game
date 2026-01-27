import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem, formatUnits, type Log } from 'viem'
import { base } from 'viem/chains'
import { Redis } from '@upstash/redis'
import {
  PIZZA_TOKEN_ADDRESS,
  PARLOR_MANAGER_ADDRESS,
  PIZZA_PARTY_ADDRESS,
  PIZZA_STAKING_ADDRESS,
} from '@/app/lib/constants'

export const dynamic = 'force-dynamic'

const redis = Redis.fromEnv()
const CACHE_KEY = 'parlor:fees:breakdown'
const CACHE_TTL_SECONDS = 300 // 5 minutes - fees don't change often

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const MAX_BLOCK_RANGE = 49000n // RPC limit is 50k, use 49k for safety

interface FeeBreakdown {
  dailyPotFees: string
  earlyUnlockFees: string
  totalFees: string
  cachedAt: number
}

// Fetch logs in chunks to avoid RPC block range limits
async function getLogsChunked(
  from: `0x${string}`,
  to: `0x${string}`,
  startBlock: bigint,
  endBlock: bigint,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Log<bigint, number, false, undefined, true, any, any>[]> {
  const allLogs: Log[] = []
  let currentFrom = startBlock

  while (currentFrom <= endBlock) {
    const currentTo = currentFrom + MAX_BLOCK_RANGE > endBlock
      ? endBlock
      : currentFrom + MAX_BLOCK_RANGE

    const logs = await publicClient.getLogs({
      address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
      event: transferEvent,
      args: { from, to },
      fromBlock: currentFrom,
      toBlock: currentTo,
    })

    allLogs.push(...logs)
    currentFrom = currentTo + 1n
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return allLogs as any
}

export async function GET() {
  try {
    // Check cache first
    const cached = await redis.get<FeeBreakdown>(CACHE_KEY)
    if (cached) {
      return NextResponse.json({ success: true, ...cached, fromCache: true })
    }

    // Fetch from chain
    const currentBlock = await publicClient.getBlockNumber()
    const BLOCKS_PER_DAY = BigInt(43200)
    const fromBlock = currentBlock - (BLOCKS_PER_DAY * 7n) // 7 days

    // Fetch both sources in parallel (chunked to respect RPC limits)
    const [dailyPotLogs, earlyUnlockLogs] = await Promise.all([
      getLogsChunked(
        PIZZA_PARTY_ADDRESS as `0x${string}`,
        PARLOR_MANAGER_ADDRESS as `0x${string}`,
        fromBlock,
        currentBlock,
      ),
      getLogsChunked(
        PIZZA_STAKING_ADDRESS as `0x${string}`,
        PARLOR_MANAGER_ADDRESS as `0x${string}`,
        fromBlock,
        currentBlock,
      ),
    ])

    const totalDailyPot = dailyPotLogs.reduce((sum, log) => sum + (log.args.value || 0n), 0n)
    const totalEarlyUnlock = earlyUnlockLogs.reduce((sum, log) => sum + (log.args.value || 0n), 0n)

    const result: FeeBreakdown = {
      dailyPotFees: formatUnits(totalDailyPot, 18),
      earlyUnlockFees: formatUnits(totalEarlyUnlock, 18),
      totalFees: formatUnits(totalDailyPot + totalEarlyUnlock, 18),
      cachedAt: Date.now(),
    }

    // Cache in Redis
    await redis.set(CACHE_KEY, result, { ex: CACHE_TTL_SECONDS })

    return NextResponse.json({ success: true, ...result, fromCache: false })
  } catch (error) {
    console.error('Parlor fees API error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch fees' },
      { status: 500 }
    )
  }
}
