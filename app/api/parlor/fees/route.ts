import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
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
const CACHE_KEY = 'parlor:fees:sources'
const CACHE_TTL_SECONDS = 600 // 10 minutes - proportions don't change fast

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const MAX_BLOCK_RANGE = 49000n

interface FeeSources {
  dailyPotTotal: string
  earlyUnlockTotal: string
  cachedAt: number
}

// Fetch logs in chunks to avoid RPC block range limits
async function getTransferTotal(
  from: `0x${string}`,
  to: `0x${string}`,
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
      address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
      event: transferEvent,
      args: { from, to },
      fromBlock: currentFrom,
      toBlock: currentTo,
    })

    for (const log of logs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total += (log as any).args.value || 0n
    }
    currentFrom = currentTo + 1n
  }

  return total
}

export async function GET() {
  try {
    // Check cache first
    const cached = await redis.get<FeeSources>(CACHE_KEY)
    if (cached) {
      return NextResponse.json({ success: true, ...cached, fromCache: true })
    }

    // Scan last 7 days for fee source proportions
    const currentBlock = await publicClient.getBlockNumber()
    const BLOCKS_PER_DAY = BigInt(43200)
    const fromBlock = currentBlock - (BLOCKS_PER_DAY * 7n)

    // Fetch both sources in parallel
    const [totalDailyPot, totalEarlyUnlock] = await Promise.all([
      getTransferTotal(
        PIZZA_PARTY_ADDRESS as `0x${string}`,
        PARLOR_MANAGER_ADDRESS as `0x${string}`,
        fromBlock,
        currentBlock,
      ),
      getTransferTotal(
        PIZZA_STAKING_ADDRESS as `0x${string}`,
        PARLOR_MANAGER_ADDRESS as `0x${string}`,
        fromBlock,
        currentBlock,
      ),
    ])

    const result: FeeSources = {
      dailyPotTotal: formatUnits(totalDailyPot, 18),
      earlyUnlockTotal: formatUnits(totalEarlyUnlock, 18),
      cachedAt: Date.now(),
    }

    // Cache result
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
