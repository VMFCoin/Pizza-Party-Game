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
const CACHE_KEY = 'parlor:fees:breakdown'
const CACHE_TTL_SECONDS = 60

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

interface FeeBreakdown {
  dailyPotFees: string
  earlyUnlockFees: string
  totalFees: string
  cachedAt: number
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
    const fromBlock = currentBlock - (BLOCKS_PER_DAY * 90n)

    // Fetch both sources in parallel
    const [dailyPotLogs, earlyUnlockLogs] = await Promise.all([
      publicClient.getLogs({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        event: transferEvent,
        args: {
          from: PIZZA_PARTY_ADDRESS as `0x${string}`,
          to: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        },
        fromBlock,
        toBlock: currentBlock,
      }),
      publicClient.getLogs({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        event: transferEvent,
        args: {
          from: PIZZA_STAKING_ADDRESS as `0x${string}`,
          to: PARLOR_MANAGER_ADDRESS as `0x${string}`,
        },
        fromBlock,
        toBlock: currentBlock,
      }),
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
