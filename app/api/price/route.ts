import { NextResponse } from 'next/server'
import { PIZZA_TOKEN_ADDRESS } from '@/app/lib/constants'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// DEXScreener API for PIZZA token on Base (address from constants)
const DEXSCREENER_API = `https://api.dexscreener.com/latest/dex/tokens/${PIZZA_TOKEN_ADDRESS}`

interface DexScreenerPair {
  priceUsd: string
  liquidity?: { usd: number }
  volume?: { h24: number }
  chainId: string
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null
}

export async function GET() {
  try {
    const response = await fetch(DEXSCREENER_API, {
      headers: {
        'Accept': 'application/json',
      },
      // Don't cache - we want live prices
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`DEXScreener API error: ${response.status}`)
    }

    const data: DexScreenerResponse = await response.json()

    // Find the Base chain pair with highest liquidity
    const basePairs = data.pairs?.filter(p => p.chainId === 'base') || []
    const bestPair = basePairs.sort((a, b) =>
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0]

    if (!bestPair || !bestPair.priceUsd) {
      throw new Error('No PIZZA pairs found on Base')
    }

    const priceUsd = parseFloat(bestPair.priceUsd)

    if (isNaN(priceUsd) || priceUsd <= 0) {
      throw new Error('Invalid price value')
    }

    // Calculate how many PIZZA tokens = $1
    const pizzaPerDollar = 1 / priceUsd

    // Convert to wei (18 decimals)
    const pizzaPerDollarWei = Math.floor(pizzaPerDollar * 1e18)

    return NextResponse.json({
      success: true,
      priceUsd,
      pizzaPerDollar,
      pizzaPerDollarWei: pizzaPerDollarWei.toString(),
      liquidity: bestPair.liquidity?.usd || 0,
      volume24h: bestPair.volume?.h24 || 0,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })

  } catch (error) {
    console.error('Price API error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch price',
      // Fallback to 0.01 if API fails (entry = 100 PIZZA for $1)
      priceUsd: 0.01,
      pizzaPerDollar: 100,
      pizzaPerDollarWei: '100000000000000000000', // 100 PIZZA
      timestamp: Date.now(),
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }
}
