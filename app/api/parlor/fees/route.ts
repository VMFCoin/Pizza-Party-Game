import { NextResponse } from 'next/server'
import { formatUnits } from 'viem'
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
const CACHE_TTL_SECONDS = 600 // 10 minutes

// Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ''

// Use last 7 days of blocks
const BLOCKS_PER_DAY = 43200

interface FeeSources {
  dailyPotTotal: string
  earlyUnlockTotal: string
  cachedAt: number
}

async function getTransferTotal(from: string, to: string, fromBlock: number): Promise<bigint> {
  const fromTopic = '0x' + from.slice(2).toLowerCase().padStart(64, '0')
  const toTopic = '0x' + to.slice(2).toLowerCase().padStart(64, '0')

  const url = `https://api.etherscan.io/v2/api?chainid=8453&module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${PIZZA_TOKEN_ADDRESS}&topic0=${TRANSFER_TOPIC}&topic1=${fromTopic}&topic2=${toTopic}&apikey=${BASESCAN_API_KEY}`

  const response = await fetch(url)
  const data = await response.json()

  let total = 0n
  if (data.status === '1' && Array.isArray(data.result)) {
    for (const log of data.result) {
      total += BigInt(log.data)
    }
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

    // Get approximate block from 7 days ago
    // Current block ~41.7M, 7 days = ~302,400 blocks
    const fromBlock = Math.max(0, 41700000 - (BLOCKS_PER_DAY * 7))

    // Fetch both sources in parallel
    const [totalDailyPot, totalEarlyUnlock] = await Promise.all([
      getTransferTotal(PIZZA_PARTY_ADDRESS, PARLOR_MANAGER_ADDRESS, fromBlock),
      getTransferTotal(PIZZA_STAKING_ADDRESS, PARLOR_MANAGER_ADDRESS, fromBlock),
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
