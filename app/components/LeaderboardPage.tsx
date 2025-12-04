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

// Create a client for direct RPC calls
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

// Old contract for historical stats
const OLD_CONTRACT_ADDRESS = '0x5c3aaD450F0014292Ff363b2147e6571b16c8035' as const

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
  lifetimeVmfWon: string  // Total across ALL games
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

  // Game 12 Daily Winners (from old contract settlement tx 0x68b8accb...)
  // These are hardcoded because old contract didn't store winners array
  const GAME_12_DAILY_WINNERS: WinnerDisplay[] = [
    { address: '0xc77da8cb158ba77bac765625745a766af3111a69', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xd68c5493e41f03fac90776ad0366376e245255e8', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x1b49689db12080f5fcc5dc36f990599739487566', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x14e8fddfa4a7c709c19a8c7da5205c3ae366355c', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x802f18765d6945b82075241e40b6214331ca3641', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0xffde42d40175b3b9349dfb384439dcb811691e09', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x86e36c9ba3c6a2542fd761bc2b4fd61a110ea6cd', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
    { address: '0x598986fac0d3ff7eac3d55ffab5e67c2a27c2765', displayName: '', thisGamePayout: '128.8', lifetimeWins: 0, lifetimeVmfWon: '0' },
  ]

  // Weekly 2 Winners (no weekly settlement yet for week 2)
  const WEEK_2_WINNERS: WinnerDisplay[] = []

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

  // Determine which game we're showing (previous settled game)
  const currentDailyId = dailyGameId ? Number(dailyGameId) : 13
  const currentWeeklyId = weeklyGameId ? Number(weeklyGameId) : 3
  const previousDailyGameId = currentDailyId - 1 // Game 12
  const previousWeeklyGameId = currentWeeklyId - 1 // Weekly 2

  // For Game 13+, read from new contract
  const { data: dailyWinnersAddresses } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getDailyGameWinners',
    args: [BigInt(previousDailyGameId)],
    query: { enabled: previousDailyGameId >= 13 },
  })

  const { data: weeklyWinnersAddresses } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getWeeklyGameWinners',
    args: [BigInt(previousWeeklyGameId)],
    query: { enabled: previousWeeklyGameId >= 3 },
  })

  const { data: previousDailyGame } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGames',
    args: [BigInt(previousDailyGameId)],
    query: { enabled: previousDailyGameId >= 13 },
  })

  const { data: previousWeeklyGame } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'weeklyGames',
    args: [BigInt(previousWeeklyGameId)],
    query: { enabled: previousWeeklyGameId >= 3 },
  })

  // Helper function to fetch lifetime stats from both contracts
  async function fetchLifetimeStats(playerAddress: string): Promise<{ wins: number; vmfWon: string }> {
    try {
      // Fetch from old contract (historical stats)
      const oldStats = await publicClient.readContract({
        address: OLD_CONTRACT_ADDRESS,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [playerAddress as `0x${string}`],
      }) as [bigint, bigint, bigint, bigint, bigint]

      // Fetch from new contract (migrated + new stats)
      const newStats = await publicClient.readContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [playerAddress as `0x${string}`],
      }) as [bigint, bigint, bigint, bigint, bigint]

      // Old contract stats: [totalDailyWins, totalWeeklyWins, totalVmfWon, lifetimeToppings, lifetimeReferrals]
      // New contract has migrated stats, so we use the MAX of old and new (since new includes migrated data)
      const totalDailyWins = Math.max(Number(oldStats[0]), Number(newStats[0]))
      const totalWeeklyWins = Math.max(Number(oldStats[1]), Number(newStats[1]))
      const totalVmfWon = BigInt(oldStats[2]) > BigInt(newStats[2]) ? oldStats[2] : newStats[2]

      return {
        wins: totalDailyWins + totalWeeklyWins,
        vmfWon: Number(formatUnits(totalVmfWon, 18)).toFixed(1),
      }
    } catch (error) {
      console.error('Error fetching lifetime stats for', playerAddress, error)
      return { wins: 0, vmfWon: '0' }
    }
  }

  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        setLoading(true)

        let dailyPlayersData: WinnerDisplay[]
        let weeklyPlayersData: WinnerDisplay[]

        // Use hardcoded data for Game 12, otherwise read from contract
        if (previousDailyGameId === 12) {
          dailyPlayersData = [...GAME_12_DAILY_WINNERS]
        } else if (previousDailyGameId >= 13) {
          const dailyAddresses = (dailyWinnersAddresses as string[]) || []
          const dailyPot = previousDailyGame ? (previousDailyGame as { potAmount: bigint }).potAmount : 0n
          const dailyPayoutPerWinner = dailyAddresses.length > 0
            ? Number(formatUnits(BigInt(dailyPot) * 94n / 100n / BigInt(dailyAddresses.length), 18)).toFixed(1)
            : '0'

          dailyPlayersData = dailyAddresses.map((addr: string) => ({
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout: dailyPayoutPerWinner,
            lifetimeWins: 0,
            lifetimeVmfWon: '0',
          }))
        } else {
          dailyPlayersData = []
        }

        // Use hardcoded data for Week 2, otherwise read from contract
        if (previousWeeklyGameId === 2) {
          weeklyPlayersData = [...WEEK_2_WINNERS]
        } else if (previousWeeklyGameId >= 3) {
          const weeklyAddresses = (weeklyWinnersAddresses as string[]) || []
          const weeklyPot = previousWeeklyGame ? (previousWeeklyGame as { potAmount: bigint }).potAmount : 0n
          const weeklyPayoutPerWinner = weeklyAddresses.length > 0
            ? Number(formatUnits(BigInt(weeklyPot) / BigInt(weeklyAddresses.length), 18)).toFixed(1)
            : '0'

          weeklyPlayersData = weeklyAddresses.map((addr: string) => ({
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout: weeklyPayoutPerWinner,
            lifetimeWins: 0,
            lifetimeVmfWon: '0',
          }))
        } else {
          weeklyPlayersData = []
        }

        // Fetch lifetime stats for all players
        const allAddresses = [...new Set([
          ...dailyPlayersData.map(p => p.address),
          ...weeklyPlayersData.map(p => p.address),
        ])]

        const statsPromises = allAddresses.map(addr => fetchLifetimeStats(addr))
        const statsResults = await Promise.all(statsPromises)
        const statsMap = new Map<string, { wins: number; vmfWon: string }>()
        allAddresses.forEach((addr, i) => {
          statsMap.set(addr.toLowerCase(), statsResults[i])
        })

        // Update players with lifetime stats
        dailyPlayersData = dailyPlayersData.map(player => {
          const stats = statsMap.get(player.address.toLowerCase())
          return {
            ...player,
            lifetimeWins: stats?.wins || 0,
            lifetimeVmfWon: stats?.vmfWon || '0',
          }
        })

        weeklyPlayersData = weeklyPlayersData.map(player => {
          const stats = statsMap.get(player.address.toLowerCase())
          return {
            ...player,
            lifetimeWins: stats?.wins || 0,
            lifetimeVmfWon: stats?.vmfWon || '0',
          }
        })

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

  const renderWinnerRow = (winner: WinnerDisplay, position: number) => {
    const style = getPositionStyle(position)
    const isPlaceholder = !!winner.isPlaceholder
    const isCurrentUser = !isPlaceholder && address?.toLowerCase() === winner.address.toLowerCase()

    return (
      <div
        className={`flex items-center justify-between p-2 rounded-xl border-2 ${style.bg} ${style.border} shadow-md`}
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-1 min-w-[40px]">
            <span className={`text-lg font-bold ${style.textColor}`} style={customFontStyle}>
              {position}.
            </span>
          </div>
          <ProfilePicture
            key={`${winner.address}-${winner.farcasterProfile?.pfpUrl || 'no-pfp'}`}
            pfpUrl={winner.farcasterProfile?.pfpUrl}
            address={winner.address}
            isPlaceholder={isPlaceholder}
          />
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
            {winner.farcasterProfile?.displayName && !isPlaceholder && (
              <span className="text-xs text-gray-500" style={customFontStyle}>
                {winner.farcasterProfile.displayName}
              </span>
            )}
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
                  {winner.lifetimeVmfWon} VMF
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          {/* ✅ THIS GAME'S PAYOUT (green) - Amount won in THIS specific game */}
          <span className="text-lg font-bold text-green-600" style={customFontStyle}>
            {winner.thisGamePayout} VMF
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
                  alt="LEADERBOARD - See who's winning the most VMF tokens!"
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
                        {renderWinnerRow(winner, index + 1)}
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
                    <span><strong>EARN MORE TOPPINGS:</strong> Play daily, refer friends, hold VMF coins.</span>
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
