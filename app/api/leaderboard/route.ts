import { NextResponse } from 'next/server'
import { createPublicClient, http, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '@/app/lib/constants'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Create server-side RPC client
// Using Publicnode RPC which is fully public and works from edge functions
// (mainnet.base.org blocks Vercel, Ankr requires API key)
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

interface GameData {
  gameId: number
  startTime: string
  endTime: string
  potAmount: string
  settled: boolean
  winners: string[]
  usdCentsPerWinner: number // USD value locked at settlement (0 if not set)
}

interface LeaderboardResponse {
  success: boolean
  dailyGameId: number
  weeklyGameId: number
  latestDailyGame: GameData | null
  latestWeeklyGame: GameData | null
  playerStats: Record<string, { totalWins: number; totalPizzaWon: string }>
  error?: string
}

export async function GET(): Promise<NextResponse<LeaderboardResponse>> {
  try {
    // Get current game IDs
    const [dailyGameId, weeklyGameId] = await Promise.all([
      publicClient.readContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'dailyGameId',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'weeklyGameId',
      }) as Promise<bigint>,
    ])

    console.log('[Leaderboard API] dailyGameId:', dailyGameId.toString(), 'weeklyGameId:', weeklyGameId.toString())

    let latestDailyGame: GameData | null = null
    let latestWeeklyGame: GameData | null = null
    const allWinnerAddresses: string[] = []

    // Find the most recent daily game with winners
    // Game 3 has winners but settled=false due to a bug, so we check winners first
    const currentDailyId = Number(dailyGameId)
    for (let gameId = currentDailyId; gameId >= 1; gameId--) {
      try {
        const winners = await publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getDailyGameWinners',
          args: [BigInt(gameId)],
        }) as string[]

        console.log(`[Leaderboard API] Daily Game ${gameId} winners:`, winners?.length || 0)

        if (winners && winners.length > 0) {
          // Fetch game data and USD value in parallel
          const [gameData, usdCentsRaw] = await Promise.all([
            publicClient.readContract({
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'dailyGames',
              args: [BigInt(gameId)],
            }) as Promise<{ startTime: bigint; endTime: bigint; firstPlayer: string; potAmount: bigint; settled: boolean }>,
            publicClient.readContract({
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'getDailyGameUsdValue',
              args: [BigInt(gameId)],
            }).catch(() => 0n) as Promise<bigint>, // Returns 0 if function doesn't exist yet
          ])

          console.log(`[Leaderboard API] Daily Game ${gameId}: settled=${gameData.settled}, pot=${gameData.potAmount}, usdCents=${usdCentsRaw}`)

          // For display, we show the start time as the "settlement date"
          // since that's the day the game was played (endTime is when it ends, startTime is when it started)
          latestDailyGame = {
            gameId,
            startTime: gameData.startTime.toString(),
            endTime: gameData.startTime.toString(), // Use startTime for display (the day the game was played)
            potAmount: formatUnits(gameData.potAmount, 18),
            settled: gameData.settled,
            winners,
            usdCentsPerWinner: Number(usdCentsRaw),
          }
          allWinnerAddresses.push(...winners)
          break
        }
      } catch (err) {
        console.error(`[Leaderboard API] Error checking daily game ${gameId}:`, err)
      }
    }

    // Find the most recent SETTLED weekly game with winners
    const currentWeeklyId = Number(weeklyGameId)
    for (let weekId = currentWeeklyId; weekId >= 1; weekId--) {
      try {
        const weekData = await publicClient.readContract({
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'weeklyGames',
          args: [BigInt(weekId)],
        }) as unknown as { claimWindowStart: bigint; claimWindowEnd: bigint; totalClaimedToppings: bigint; potAmount: bigint; settled: boolean }

        const isSettled = weekData.settled
        if (!isSettled) continue

        // Fetch winners and USD value in parallel
        const [winners, weeklyUsdCentsRaw] = await Promise.all([
          publicClient.readContract({
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'getWeeklyGameWinners',
            args: [BigInt(weekId)],
          }) as Promise<string[]>,
          publicClient.readContract({
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'getWeeklyGameUsdValue',
            args: [BigInt(weekId)],
          }).catch(() => 0n) as Promise<bigint>, // Returns 0 if function doesn't exist yet
        ])

        if (winners && winners.length > 0) {
          latestWeeklyGame = {
            gameId: weekId,
            startTime: weekData.claimWindowStart.toString(),
            endTime: weekData.claimWindowEnd.toString(),
            potAmount: formatUnits(weekData.potAmount, 18),
            settled: weekData.settled,
            winners,
            usdCentsPerWinner: Number(weeklyUsdCentsRaw),
          }
          allWinnerAddresses.push(...winners)
          break
        }
      } catch (err) {
        console.error(`[Leaderboard API] Error checking weekly game ${weekId}:`, err)
      }
    }

    // Fetch lifetime stats for all unique addresses
    const uniqueAddresses = [...new Set(allWinnerAddresses)]
    const playerStats: Record<string, { totalWins: number; totalPizzaWon: string }> = {}

    if (uniqueAddresses.length > 0) {
      try {
        const contractCalls = uniqueAddresses.map(addr => ({
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getPlayerLifetimeStats',
          args: [addr as `0x${string}`],
        } as const))

        const results = await publicClient.multicall({ contracts: contractCalls, allowFailure: true })

        uniqueAddresses.forEach((addr, i) => {
          const result = results[i]
          if (result.status === 'success' && result.result) {
            const stats = result.result as unknown as { totalDailyWins: bigint; totalWeeklyWins: bigint; totalPizzaWon: bigint }
            playerStats[addr.toLowerCase()] = {
              totalWins: Number(stats.totalDailyWins) + Number(stats.totalWeeklyWins),
              totalPizzaWon: formatUnits(stats.totalPizzaWon, 18),
            }
          } else {
            playerStats[addr.toLowerCase()] = { totalWins: 0, totalPizzaWon: '0' }
          }
        })
      } catch (err) {
        console.error('[Leaderboard API] Error fetching lifetime stats:', err)
      }
    }

    return NextResponse.json({
      success: true,
      dailyGameId: currentDailyId,
      weeklyGameId: currentWeeklyId,
      latestDailyGame,
      latestWeeklyGame,
      playerStats,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    })

  } catch (error) {
    console.error('[Leaderboard API] Error:', error)
    return NextResponse.json({
      success: false,
      dailyGameId: 0,
      weeklyGameId: 0,
      latestDailyGame: null,
      latestWeeklyGame: null,
      playerStats: {},
      error: error instanceof Error ? error.message : 'Failed to fetch leaderboard data',
    }, { status: 500 })
  }
}
