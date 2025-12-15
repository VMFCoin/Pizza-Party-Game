'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { useAccount, useReadContract } from 'wagmi'
import { enrichLeaderboardWithProfiles, FarcasterProfile } from '../lib/farcasterProfiles'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { formatUnits } from 'viem'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

// Create a client for direct RPC calls - use BlastAPI to avoid rate limits
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.public.blastapi.io'),
})

// All historical stats have been migrated to the current contract
// No need to read from old contracts anymore

interface LeaderboardPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToHome?: () => void
}

interface WinnerDisplay {
  address: string
  displayName: string
  thisGamePayout: string  // Amount won in THIS specific game
  lifetimeWins: number
  lifetimePizzaWon: string  // Total across ALL games
  farcasterProfile?: FarcasterProfile
  isPlaceholder?: boolean
}

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
}

function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}


function getPositionStyle(position: number) {
  if (position === 1) {
    return {
      bg: 'bg-gradient-to-r from-yellow-400 to-yellow-500',
      border: 'border-yellow-600',
      textColor: 'text-yellow-900',
    }
  }
  if (position === 2) {
    return {
      bg: 'bg-gradient-to-r from-gray-300 to-gray-400',
      border: 'border-gray-500',
      textColor: 'text-gray-800',
    }
  }
  if (position === 3) {
    return {
      bg: 'bg-gradient-to-r from-orange-400 to-orange-500',
      border: 'border-orange-600',
      textColor: 'text-orange-900',
    }
  }
  return {
    bg: 'bg-white',
    border: 'border-gray-300',
    textColor: 'text-gray-800',
  }
}

export default function LeaderboardPage({
  onBack: _onBack,
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToHome,
}: LeaderboardPageProps) {
  const { address } = useAccount()
  const [dailyWinners, setDailyWinners] = useState<WinnerDisplay[]>([])
  const [weeklyWinners, setWeeklyWinners] = useState<WinnerDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [pizzaUsd, setPizzaUsd] = useState(0.01) // Default PIZZA price

  // Fetch PIZZA price from Dexscreener
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/price')
        const data = await res.json()
        if (data.priceUsd) {
          setPizzaUsd(parseFloat(data.priceUsd))
        }
      } catch (err) {
        console.error('Failed to fetch PIZZA price:', err)
      }
    }
    fetchPrice()
  }, [])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const navigateToDaily = useCallback(() => {
    if (onNavigateToDaily) {
      onNavigateToDaily()
    } else if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [onNavigateToDaily])

  const navigateToWeekly = useCallback(() => {
    if (onNavigateToWeekly) {
      onNavigateToWeekly()
    } else if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }, [onNavigateToWeekly])

  // V2 Contract - Fresh start! No historical data from old contracts.

  // Get current game IDs from new contract
  const { data: dailyGameId } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGameId',
  })

  const { data: weeklyGameId } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'weeklyGameId',
  })

  // Determine which game we're showing (most recently settled game)
  // Contract's dailyGameId is 1 ahead of settled game (e.g., dailyGameId = 2, settled game = 1)
  // V2 Contract: Fresh start at Game #1, Week #1
  const previousDailyGameId = dailyGameId ? Number(dailyGameId) - 1 : 0  // Last settled daily game
  const previousWeeklyGameId = weeklyGameId ? Number(weeklyGameId) - 1 : 0 // Last settled weekly game

  // Read winners from V2 contract (only if a game has settled)
  const { data: dailyWinnersAddresses } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getDailyGameWinners',
    args: [BigInt(Math.max(previousDailyGameId, 1))],
    query: { enabled: previousDailyGameId >= 1 },
  })

  const { data: weeklyWinnersAddresses } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getWeeklyGameWinners',
    args: [BigInt(Math.max(previousWeeklyGameId, 1))],
    query: { enabled: previousWeeklyGameId >= 1 },
  })

  const { data: previousDailyGame } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGames',
    args: [BigInt(Math.max(previousDailyGameId, 1))],
    query: { enabled: previousDailyGameId >= 1 },
  })

  const { data: previousWeeklyGame } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'weeklyGames',
    args: [BigInt(Math.max(previousWeeklyGameId, 1))],
    query: { enabled: previousWeeklyGameId >= 1 },
  })

  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        setLoading(true)

        let dailyPlayersData: WinnerDisplay[] = []
        let weeklyPlayersData: WinnerDisplay[] = []

        // V2 Contract - Fresh start! Only read from new contract.
        const dailyAddresses = (dailyWinnersAddresses as string[]) || []

        if (dailyAddresses.length > 0 && previousDailyGameId >= 1) {
          // We have winners from the V2 contract
          const dailyPot = previousDailyGame ? (previousDailyGame as { potAmount: bigint }).potAmount : 0n
          const dailyPayoutPerWinner = dailyAddresses.length > 0 && dailyPot > 0n
            ? Number(formatUnits(BigInt(dailyPot) * 94n / 100n / BigInt(dailyAddresses.length), 18)).toFixed(1)
            : '0'

          dailyPlayersData = dailyAddresses.map((addr: string) => ({
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout: dailyPayoutPerWinner,
            lifetimeWins: 0,
            lifetimePizzaWon: '0',
          }))
        }
        // No fallback - if no winners yet, show empty state

        // Weekly winners from V2 contract
        if (previousWeeklyGameId >= 1) {
          const weeklyAddresses = (weeklyWinnersAddresses as string[]) || []
          if (weeklyAddresses.length > 0) {
            const weeklyPot = previousWeeklyGame ? (previousWeeklyGame as { potAmount: bigint }).potAmount : 0n
            const weeklyPayoutPerWinner = weeklyAddresses.length > 0 && weeklyPot > 0n
              ? Number(formatUnits(BigInt(weeklyPot) / BigInt(weeklyAddresses.length), 18)).toFixed(1)
              : '0'

            weeklyPlayersData = weeklyAddresses.map((addr: string) => ({
              address: addr,
              displayName: formatAddress(addr),
              thisGamePayout: weeklyPayoutPerWinner,
              lifetimeWins: 0,
              lifetimePizzaWon: '0',
            }))
          }
        }
        // No fallback - if no weekly winners yet, show empty state

        // Fetch lifetime stats for all players using multicall for efficiency
        const allAddresses = [...new Set([
          ...dailyPlayersData.map(p => p.address),
          ...weeklyPlayersData.map(p => p.address),
        ])]

        const statsMap = new Map<string, { wins: number; pizzaWon: string }>()

        // Use multicall to batch all requests - all stats are now in current contract
        try {
          const contractCalls = allAddresses.map(addr => ({
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'getPlayerLifetimeStats',
            args: [addr as `0x${string}`],
          } as const))

          const results = await publicClient.multicall({ contracts: contractCalls, allowFailure: true })

          // Process results
          allAddresses.forEach((addr, i) => {
            const result = results[i]
            if (result.status === 'success' && result.result) {
              const stats = result.result as unknown as { totalDailyWins: bigint; totalWeeklyWins: bigint; totalPizzaWon: bigint }
              statsMap.set(addr.toLowerCase(), {
                wins: Number(stats.totalDailyWins) + Number(stats.totalWeeklyWins),
                pizzaWon: Number(formatUnits(stats.totalPizzaWon, 18)).toFixed(1),
              })
            } else {
              statsMap.set(addr.toLowerCase(), { wins: 0, pizzaWon: '0' })
            }
          })
        } catch (err) {
          console.error('Error fetching lifetime stats via multicall:', err)
          allAddresses.forEach(addr => {
            statsMap.set(addr.toLowerCase(), { wins: 0, pizzaWon: '0' })
          })
        }

        // Update players with lifetime stats
        dailyPlayersData = dailyPlayersData.map(player => {
          const stats = statsMap.get(player.address.toLowerCase())
          return {
            ...player,
            lifetimeWins: stats?.wins || 0,
            lifetimePizzaWon: stats?.pizzaWon || '0',
          }
        })

        weeklyPlayersData = weeklyPlayersData.map(player => {
          const stats = statsMap.get(player.address.toLowerCase())
          return {
            ...player,
            lifetimeWins: stats?.wins || 0,
            lifetimePizzaWon: stats?.pizzaWon || '0',
          }
        })

        // Sort by lifetime wins (descending), then by PIZZA won (descending) as tiebreaker
        const sortByLifetimeStats = (a: WinnerDisplay, b: WinnerDisplay) => {
          // First sort by wins (more wins = higher rank)
          if (b.lifetimeWins !== a.lifetimeWins) {
            return b.lifetimeWins - a.lifetimeWins
          }
          // Tiebreaker: sort by PIZZA won (more PIZZA = higher rank)
          return parseFloat(b.lifetimePizzaWon) - parseFloat(a.lifetimePizzaWon)
        }

        dailyPlayersData.sort(sortByLifetimeStats)
        weeklyPlayersData.sort(sortByLifetimeStats)

        // Enrich with Farcaster profiles
        const [enrichedDaily, enrichedWeekly] = await Promise.all([
          enrichLeaderboardWithProfiles(dailyPlayersData, address),
          enrichLeaderboardWithProfiles(weeklyPlayersData, address),
        ])

        setDailyWinners(enrichedDaily)
        setWeeklyWinners(enrichedWeekly)
      } catch (error) {
        console.error('Failed to fetch leaderboard data:', error)
        setDailyWinners([])
        setWeeklyWinners([])
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, dailyWinnersAddresses, weeklyWinnersAddresses, previousDailyGame, previousWeeklyGame, previousDailyGameId, previousWeeklyGameId])

  const ProfilePicture = ({ 
    pfpUrl, 
    address, 
    isPlaceholder 
  }: { 
    pfpUrl?: string
    address: string
    isPlaceholder: boolean 
  }) => {
    const [imageError, setImageError] = useState(false)
    const [currentPfpUrl, setCurrentPfpUrl] = useState<string | undefined>(pfpUrl)
    
    useEffect(() => {
      if (pfpUrl !== currentPfpUrl) {
        setCurrentPfpUrl(pfpUrl)
        setImageError(false)
      }
    }, [pfpUrl, currentPfpUrl])
    
    const shouldShowImage = !isPlaceholder && currentPfpUrl && !imageError

    return (
      <div className="w-9 h-9 rounded-full bg-gray-200 border-2 border-gray-300 flex items-center justify-center overflow-hidden">
        {shouldShowImage ? (
          <Image
            key={currentPfpUrl}
            src={currentPfpUrl}
            alt="Profile"
            width={36}
            height={36}
            className="object-cover"
            unoptimized
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs font-bold">
            {isPlaceholder ? '⏳' : address.slice(2, 4).toUpperCase()}
          </div>
        )}
      </div>
    )
  }

  const renderWinnerRow = (winner: WinnerDisplay, position: number, isWeekly: boolean = false, gameId: number = 0) => {
    const style = getPositionStyle(position)
    const isPlaceholder = !!winner.isPlaceholder
    const isCurrentUser = !isPlaceholder && address?.toLowerCase() === winner.address.toLowerCase()

    // Calculate USD value - weekly game 4 and earlier uses hardcoded, all else calculates dynamically
    const getUsdValue = () => {
      if (isWeekly && gameId <= 4) {
        return '$6.52'
      }
      return `$${(Number(winner.thisGamePayout) * pizzaUsd).toFixed(2)}`
    }

    return (
      <div
        className={`flex items-center justify-between p-2 rounded-xl border-2 ${style.bg} ${style.border} shadow-md`}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2 min-w-[60px]">
            <span className={`text-lg font-bold ${style.textColor}`} style={customFontStyle}>
              {position}.
            </span>
            <ProfilePicture
              key={`${winner.address}-${winner.farcasterProfile?.pfpUrl || 'no-pfp'}`}
              pfpUrl={winner.farcasterProfile?.pfpUrl}
              address={winner.address}
              isPlaceholder={isPlaceholder}
            />
          </div>
          <div className="flex flex-col">
            <span
              className={`font-bold text-base ${isPlaceholder ? 'text-gray-500' : isCurrentUser ? 'text-red-600' : style.textColor}`}
              style={customFontStyle}
            >
              {isPlaceholder
                ? winner.displayName
                : winner.farcasterProfile?.username
                ? `@${winner.farcasterProfile.username}`
                : formatAddress(winner.address)}
            </span>
            {isPlaceholder ? (
              <span className="text-xs text-gray-600" style={customFontStyle}>
                Awaiting winner…
              </span>
            ) : (
              <>
                <span className="text-xs text-gray-600" style={{ ...customFontStyle, whiteSpace: 'nowrap' }}>
                  Lifetime wins: {winner.lifetimeWins}
                </span>
                {/* ✅ LIFETIME TOTAL (gray) - Sum of ALL games ever */}
                <span className="text-xs text-gray-600" style={{ ...customFontStyle, whiteSpace: 'nowrap' }}>
                  {winner.lifetimePizzaWon} PIZZA
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right leading-tight">
          {/* ✅ THIS GAME'S PAYOUT (green) - USD value won in THIS specific game */}
          <span className="block text-lg font-bold text-green-600" style={customFontStyle}>
            {getUsdValue()}
          </span>
          <span className="block text-lg font-bold text-green-600" style={customFontStyle}>
            PIZZA
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen p-4"
      style={{
        backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
      }}
    >
      <div className="max-w-md mx-auto">
        {onNavigateToHome && (
          <Button
            onClick={onNavigateToHome}
            className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
            style={customFontStyle}
          >
            <ArrowLeft size={20} />
            Back to Home
          </Button>
        )}
        <Card
          className="border-4 border-red-700 rounded-3xl shadow-2xl p-3 !bg-transparent"
          style={{
            backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border-4 border-black relative overflow-hidden bg-white">
              <div className="relative w-full" style={{ height: isMobile ? '88px' : '100px' }}>
                <Image
                  src="/images/LeaderboardCard.png"
                  alt="LEADERBOARD - See who's winning the most PIZZA tokens!"
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 640px"
                  style={{ objectPosition: 'center 47.5%' }}
                />
              </div>
            </div>

            <Card className="border-4 border-black rounded-2xl bg-blue-50/95 shadow-lg">
              <div className="px-4" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                <div className="flex items-center justify-center gap-1 mb-1 text-center">
                  <span className="text-2xl">🎯</span>
                  <h2
                    className="text-2xl font-bold text-center"
                    style={{ ...customFontStyle, fontSize: 'clamp(20px, 8vw, 28px)', color: '#16a34a' }}
                >
                  DAILY WINNERS
                  </h2>
                  <span className="text-2xl">🎯</span>
                </div>
                <p className="text-base font-semibold mb-2 text-center" style={{ ...customFontStyle, color: '#16a34a' }}>
                  Today&apos;s 8 lucky winners
                </p>
                {loading ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    Loading...
                  </p>
                ) : dailyWinners.length === 0 ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    🎮 Game in progress... Winners will appear when today&apos;s game settles at 12pm PST
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dailyWinners.map((winner, index) => (
                      <div key={`daily-${winner.address}-${index}`}>
                        {renderWinnerRow(winner, index + 1)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="border-4 border-black rounded-2xl bg-purple-50/95 shadow-lg">
              <div className="px-4" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                <div className="flex items-center justify-center gap-2 mb-2 text-center">
                  <span className="text-2xl">🍕</span>
                  <h2
                    className="text-2xl font-bold text-center"
                    style={{ ...customFontStyle, fontSize: 'clamp(20px, 8vw, 28px)', color: '#16a34a' }}
                >
                  WEEKLY WINNERS
                  </h2>
                  <span className="text-2xl">🍕</span>
                </div>
                <p className="text-base font-semibold mb-4 text-center" style={{ ...customFontStyle, color: '#16a34a' }}>
                  This week&apos;s top 10 champions
                </p>
                {loading ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    Loading...
                  </p>
                ) : weeklyWinners.length === 0 ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    🎮 Weekly game in progress... Winners will appear when the game settles on Monday at 12pm PST
                  </p>
                ) : (
                  <div className="space-y-3">
                    {weeklyWinners.map((winner, index) => (
                      <div key={`weekly-${winner.address}-${index}`}>
                        {renderWinnerRow(winner, index + 1, true, previousWeeklyGameId)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Button
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase"
            style={{ ...customFontStyle, fontSize: 20 }}
            onClick={navigateToDaily}
          >
            <span style={{ fontSize: '24px', marginRight: '4px' }}>🍕</span>
            GRAB A SLICE
            <span style={{ fontSize: '24px', marginLeft: '4px' }}>🍕</span>
          </Button>

            <Button
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
              style={{ ...customFontStyle, fontSize: 20, letterSpacing: '1px' }}
              onClick={navigateToWeekly}
            >
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
              Weekly Jackpot
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
            </Button>

            <Card className="border-4 border-red-500 rounded-2xl bg-white/95">
              <div className="p-3">
                <p
                  className="text-red-600 text-xl font-bold mb-2"
                  style={{ ...customFontStyle, textAlign: 'center' }}
                >
                  📊 How It Works
                </p>
                <ul className="space-y-1.5 text-red-700 text-sm font-semibold">
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span><strong>DAILY WINNERS:</strong> Today&apos;s 8 lucky winners</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span><strong>WEEKLY WINNERS:</strong> This week&apos;s top 10 champions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span><strong>EARN MORE TOPPINGS:</strong> Play daily, refer friends, hold PIZZA coins.</span>
                  </li>
                </ul>
              </div>
            </Card>
          </div>
        </Card>
      </div>
    </div>
  )
}
