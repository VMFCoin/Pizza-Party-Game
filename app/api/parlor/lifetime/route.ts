import { NextResponse } from 'next/server'
import { formatUnits, isAddress } from 'viem'
import { Redis } from '@upstash/redis'
import { PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants'

export const dynamic = 'force-dynamic'

const redis = Redis.fromEnv()
const CACHE_TTL_SECONDS = 300 // 5 minutes per-user cache

// OwnerFeesClaimed(address indexed owner, uint256 amount)
const OWNER_FEES_CLAIMED_TOPIC = '0x3011fb00bdfc6d18b37af4c10acdd9e2bdc2df4961c4dba490c638c4cb5197cd'

// ParlorManager deployment block (Dec 15, 2024)
const PARLOR_MANAGER_DEPLOY_BLOCK = 39521243

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ''

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

    // Use Etherscan v2 API (supports full range, no chunking needed)
    const ownerTopic = '0x' + addr.slice(2).padStart(64, '0')
    const url = `https://api.etherscan.io/v2/api?chainid=8453&module=logs&action=getLogs&fromBlock=${PARLOR_MANAGER_DEPLOY_BLOCK}&toBlock=latest&address=${PARLOR_MANAGER_ADDRESS}&topic0=${OWNER_FEES_CLAIMED_TOPIC}&topic1=${ownerTopic}&apikey=${BASESCAN_API_KEY}`

    const response = await fetch(url)
    const data = await response.json()

    let lifetimeTotal = 0n

    if (data.status === '1' && Array.isArray(data.result)) {
      for (const log of data.result) {
        // data field contains the uint256 amount
        const amount = BigInt(log.data)
        lifetimeTotal += amount
      }
    }

    const result = {
      lifetimeClaimed: formatUnits(lifetimeTotal, 18),
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
