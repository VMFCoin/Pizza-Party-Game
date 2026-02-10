import { NextResponse } from 'next/server'
import { formatUnits, isAddress } from 'viem'
import { Redis } from '@upstash/redis'
import { PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants'

export const dynamic = 'force-dynamic'

const redis = Redis.fromEnv()
const CACHE_TTL_SECONDS = 3600 // 1 hour - lifetime only changes on fee collection

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY
const BASESCAN_API_URL = 'https://api.etherscan.io/v2/api'
const BASE_CHAIN_ID = '8453'

// OwnerFeesClaimed(address indexed owner, uint256 amount)
const OWNER_FEES_CLAIMED_TOPIC = '0x3011fb00bdfc6d18b37af4c10acdd9e2bdc2df4961c4dba490c638c4cb5197cd'

// ParlorManager deployment block (Dec 15, 2024)
const PARLOR_MANAGER_DEPLOY_BLOCK = 39521243

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userAddress = searchParams.get('address')

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ success: false, error: 'Valid address required' }, { status: 400 })
    }

    const addr = userAddress.toLowerCase()
    const cacheKey = `parlor:lifetime:v4:${addr}`

    // Check cache first
    const cached = await redis.get<{ lifetimeClaimed: string; cachedAt: number }>(cacheKey)
    if (cached) {
      return NextResponse.json({ success: true, ...cached, fromCache: true })
    }

    // Pad address to 32 bytes for topic filter (indexed address param)
    const paddedAddress = '0x000000000000000000000000' + addr.slice(2)

    // Use Basescan API to fetch OwnerFeesClaimed events filtered by owner
    const params = new URLSearchParams({
      chainid: BASE_CHAIN_ID,
      module: 'logs',
      action: 'getLogs',
      address: PARLOR_MANAGER_ADDRESS,
      topic0: OWNER_FEES_CLAIMED_TOPIC,
      topic1: paddedAddress,
      topic0_1_opr: 'and',
      fromBlock: String(PARLOR_MANAGER_DEPLOY_BLOCK),
      toBlock: 'latest',
      apikey: BASESCAN_API_KEY || '',
    })

    const response = await fetch(`${BASESCAN_API_URL}?${params}`)
    const data = await response.json()

    let lifetimeClaimedRaw = 0n

    if (data.status === '1' && Array.isArray(data.result)) {
      for (const log of data.result) {
        // amount is the non-indexed parameter, stored in data field
        const amount = BigInt(log.data)
        lifetimeClaimedRaw += amount
      }
    }
    // status '0' with message 'No records found' means zero claims — that's valid

    const result = {
      lifetimeClaimed: formatUnits(lifetimeClaimedRaw, 18),
      cachedAt: Date.now(),
    }

    // Cache per-user result for 1 hour
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
