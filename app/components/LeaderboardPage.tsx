'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { useAccount } from 'wagmi'
import { sdk } from '@farcaster/miniapp-sdk'
import { enrichLeaderboardWithProfiles, FarcasterProfile } from '../lib/farcasterProfiles'

// All historical stats have been migrated to the current contract
// No need to read from old contracts anymore


interface LeaderboardPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToHome?: () => void
  onNavigateToParlor?: () => void
  onNavigateToStaking?: () => void
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
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Format settlement date as "Dec. 16, 2025"
// addOneDay is used for daily games since they settle the day after the game ends
function formatSettlementDate(timestamp: bigint | number | undefined, addOneDay: boolean = false): string {
  if (!timestamp) return ''
  const date = new Date(Number(timestamp) * 1000)
  if (addOneDay) {
    date.setDate(date.getDate() + 1)
  }
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.']
  const month = months[date.getMonth()]
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
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
  onNavigateToParlor,
  onNavigateToStaking,
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

  // State for game data from API
  const [displayDailyGameId, setDisplayDailyGameId] = useState<number>(0)
  const [displayWeeklyGameId, setDisplayWeeklyGameId] = useState<number>(0)
  const [dailyWinnersAddresses, setDailyWinnersAddresses] = useState<string[]>([])
  const [weeklyWinnersAddresses, setWeeklyWinnersAddresses] = useState<string[]>([])
  const [previousDailyGame, setPreviousDailyGame] = useState<{ startTime: bigint; endTime: bigint; potAmount: bigint; settled: boolean; usdCentsPerWinner: number } | null>(null)
  const [previousWeeklyGame, setPreviousWeeklyGame] = useState<{ claimWindowEnd: bigint; potAmount: bigint; settled: boolean; usdCentsPerWinner: number } | null>(null)
  const [playerStatsMap, setPlayerStatsMap] = useState<Record<string, { totalWins: number; totalPizzaWon: string }>>({})
  const [dataLoaded, setDataLoaded] = useState(false)

  // Fetch all leaderboard data from server-side API (bypasses Farcaster CSP)
  useEffect(() => {
    async function fetchLeaderboardFromAPI() {
      try {
        console.log('[Leaderboard] Fetching data from API...')
        const response = await fetch('/api/leaderboard')
        const data = await response.json()

        console.log('[Leaderboard] API response:', data)

        if (!data.success) {
          console.error('[Leaderboard] API error:', data.error)
          setDataLoaded(true)
          return
        }

        // Set daily game data
        if (data.latestDailyGame) {
          setDisplayDailyGameId(data.latestDailyGame.gameId)
          setDailyWinnersAddresses(data.latestDailyGame.winners)
          setPreviousDailyGame({
            startTime: BigInt(data.latestDailyGame.startTime),
            endTime: BigInt(data.latestDailyGame.endTime),
            potAmount: BigInt(Math.floor(parseFloat(data.latestDailyGame.potAmount) * 1e18)),
            settled: data.latestDailyGame.settled,
            usdCentsPerWinner: data.latestDailyGame.usdCentsPerWinner || 0,
          })
          console.log(`[Leaderboard] Daily game ${data.latestDailyGame.gameId} with ${data.latestDailyGame.winners.length} winners, usdCents=${data.latestDailyGame.usdCentsPerWinner}`)
        }

        // Set weekly game data
        if (data.latestWeeklyGame) {
          setDisplayWeeklyGameId(data.latestWeeklyGame.gameId)
          setWeeklyWinnersAddresses(data.latestWeeklyGame.winners)
          setPreviousWeeklyGame({
            claimWindowEnd: BigInt(data.latestWeeklyGame.endTime),
            potAmount: BigInt(Math.floor(parseFloat(data.latestWeeklyGame.potAmount) * 1e18)),
            settled: data.latestWeeklyGame.settled,
            usdCentsPerWinner: data.latestWeeklyGame.usdCentsPerWinner || 0,
          })
          console.log(`[Leaderboard] Weekly game ${data.latestWeeklyGame.gameId} with ${data.latestWeeklyGame.winners.length} winners, usdCents=${data.latestWeeklyGame.usdCentsPerWinner}`)
        }

        // Set player stats
        if (data.playerStats) {
          setPlayerStatsMap(data.playerStats)
        }

        setDataLoaded(true)
      } catch (err) {
        console.error('[Leaderboard] Failed to fetch from API:', err)
        setDataLoaded(true)
      }
    }

    fetchLeaderboardFromAPI()
  }, [])

  // Use displayGameIds for rendering
  const previousDailyGameId = displayDailyGameId
  const previousWeeklyGameId = displayWeeklyGameId

  useEffect(() => {
    async function processWinnersData() {
      try {
        setLoading(true)

        let dailyPlayersData: WinnerDisplay[] = []
        let weeklyPlayersData: WinnerDisplay[] = []

        const dailyAddresses = dailyWinnersAddresses || []

        if (dailyAddresses.length > 0 && previousDailyGameId >= 1) {
          // TODO: Remove Game 3 hardcode after Game 4 settles
          // Game 3 pot was modified during player migration, so hardcode actual payout
          let dailyPayoutPerWinner: string
          if (previousDailyGameId === 3) {
            dailyPayoutPerWinner = '664.22' // Actual payout: 664.22 PIZZA each
          } else {
            const dailyPot = previousDailyGame ? previousDailyGame.potAmount : 0n
            // Winners receive 80% of pot (after 10% stakers, 7% parlor, 3% charity deductions)
            dailyPayoutPerWinner = dailyAddresses.length > 0 && dailyPot > 0n
              ? Number(Number(dailyPot) * 0.80 / dailyAddresses.length / 1e18).toFixed(2)
              : '0'
          }

          dailyPlayersData = dailyAddresses.map((addr: string) => {
            const stats = playerStatsMap[addr.toLowerCase()]
            return {
              address: addr,
              displayName: formatAddress(addr),
              thisGamePayout: dailyPayoutPerWinner,
              lifetimeWins: stats?.totalWins || 0,
              lifetimePizzaWon: stats?.totalPizzaWon || '0',
            }
          })
        }

        // Weekly winners - no deductions, winners split 100% of weekly jackpot
        if (previousWeeklyGameId >= 1) {
          const weeklyAddresses = weeklyWinnersAddresses || []
          if (weeklyAddresses.length > 0) {
            const weeklyPot = previousWeeklyGame ? previousWeeklyGame.potAmount : 0n
            const weeklyPayoutPerWinner = weeklyAddresses.length > 0 && weeklyPot > 0n
              ? Number(Number(weeklyPot) / weeklyAddresses.length / 1e18).toFixed(2)
              : '0'

            weeklyPlayersData = weeklyAddresses.map((addr: string) => {
              const stats = playerStatsMap[addr.toLowerCase()]
              return {
                address: addr,
                displayName: formatAddress(addr),
                thisGamePayout: weeklyPayoutPerWinner,
                lifetimeWins: stats?.totalWins || 0,
                lifetimePizzaWon: stats?.totalPizzaWon || '0',
              }
            })
          }
        }

        // Sort by lifetime wins (descending), then by PIZZA won (descending) as tiebreaker
        const sortByLifetimeStats = (a: WinnerDisplay, b: WinnerDisplay) => {
          if (b.lifetimeWins !== a.lifetimeWins) {
            return b.lifetimeWins - a.lifetimeWins
          }
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
        console.error('Failed to process leaderboard data:', error)
        setDailyWinners([])
        setWeeklyWinners([])
      } finally {
        setLoading(false)
      }
    }

    // Process data once API has loaded
    if (dataLoaded) {
      if (dailyWinnersAddresses.length > 0 || weeklyWinnersAddresses.length > 0) {
        processWinnersData()
      } else {
        // No winners found, stop loading
        setLoading(false)
      }
    }
  }, [address, dataLoaded, dailyWinnersAddresses, weeklyWinnersAddresses, previousDailyGame, previousWeeklyGame, previousDailyGameId, previousWeeklyGameId, playerStatsMap])

  const handleViewProfile = async (fid: number | undefined) => {
    if (!fid) return
    try {
      await sdk.actions.viewProfile({ fid })
    } catch (error) {
      console.error('Failed to open profile:', error)
    }
  }

  const ProfilePicture = ({
    pfpUrl,
    address,
    isPlaceholder,
    fid
  }: {
    pfpUrl?: string
    address: string
    isPlaceholder: boolean
    fid?: number
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
    const isClickable = !isPlaceholder && fid

    return (
      <div
        className={`w-9 h-9 rounded-full bg-gray-200 border-2 border-gray-300 flex items-center justify-center overflow-hidden ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400' : ''}`}
        onClick={isClickable ? () => handleViewProfile(fid) : undefined}
      >
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

  const renderWinnerRow = (winner: WinnerDisplay, position: number, isWeekly: boolean = false, _gameId: number = 0) => {
    const style = getPositionStyle(position)
    const isPlaceholder = !!winner.isPlaceholder
    const isCurrentUser = !isPlaceholder && address?.toLowerCase() === winner.address.toLowerCase()

    // Get USD value - use settlement-time USD value (not current price)
    const getUsdValue = () => {
      // Use the usdCentsPerWinner from settlement time
      const gameData = isWeekly ? previousWeeklyGame : previousDailyGame
      if (gameData && gameData.usdCentsPerWinner > 0) {
        return `$${(gameData.usdCentsPerWinner / 100).toFixed(2)}`
      }
      // Fallback to calculated value if no settlement data
      return `$${(Number(winner.thisGamePayout) * pizzaUsd).toFixed(2)}`
    }

    return (
      <div
        className={`flex items-center justify-between p-2 rounded-xl border-2 ${style.bg} ${style.border} shadow-md overflow-hidden`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-lg font-bold ${style.textColor}`} style={customFontStyle}>
              {position}.
            </span>
            <ProfilePicture
              key={`${winner.address}-${winner.farcasterProfile?.pfpUrl || 'no-pfp'}`}
              pfpUrl={winner.farcasterProfile?.pfpUrl}
              address={winner.address}
              isPlaceholder={isPlaceholder}
              fid={winner.farcasterProfile?.fid}
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span
              className={`font-bold text-sm ${isPlaceholder ? 'text-gray-500' : isCurrentUser ? 'text-red-600' : style.textColor} truncate`}
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
                  {Number(winner.lifetimePizzaWon).toFixed(2)} PIZZA
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right leading-tight flex-shrink-0 ml-2">
          {/* ✅ THIS GAME'S PAYOUT (green) - USD value won in THIS specific game */}
          <span className="block text-lg font-bold text-green-600" style={customFontStyle}>
            {getUsdValue()}
          </span>
          <span className="block text-sm font-bold text-green-600" style={customFontStyle}>
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
            style={{ ...customFontStyle, fontFamily: 'var(--font-luckiest-guy)' }}
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
                <div className="flex items-center justify-center mb-1 text-center">
                  <h2
                    className="text-2xl font-bold text-center"
                    style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 'clamp(28px, 11.1vw, 40px)', color: '#FFA500', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}
                >
                  DAILY WINNERS
                  </h2>
                </div>
                <p className="text-base font-semibold mb-2 text-center" style={{ ...customFontStyle, color: '#000000' }}>
                  {previousDailyGame && previousDailyGame.endTime
                    ? `${formatSettlementDate(previousDailyGame.endTime, true)} lucky winners`
                    : "Today's 8 lucky winners"}
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
                        {renderWinnerRow(winner, index + 1, false, previousDailyGameId)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="border-4 border-black rounded-2xl bg-purple-50/95 shadow-lg">
              <div className="px-4" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                <div className="flex items-center justify-center mb-2 text-center">
                  <h2
                    className="text-2xl font-bold text-center"
                    style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 'clamp(24px, 9.7vw, 34px)', color: '#FFA500', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}
                >
                  WEEKLY WINNERS
                  </h2>
                </div>
                <p className="text-base font-semibold mb-4 text-center" style={{ ...customFontStyle, color: '#000000' }}>
                  {previousWeeklyGame && previousWeeklyGame.claimWindowEnd
                    ? `${formatSettlementDate(previousWeeklyGame.claimWindowEnd)} top 10 champions`
                    : "This week's top 10 champions"}
                </p>
                {loading ? (
                  <p className="text-center text-gray-600 py-8" style={customFontStyle}>
                    Loading...
                  </p>
                ) : weeklyWinners.length === 0 ? (
                  <p className="text-center text-gray-600 py-8" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
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
              <span className="flex items-center justify-center w-full gap-2">
                <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
                <span className="text-center">Claim Toppings</span>
                <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
              </span>
            </Button>

            {/* Own a Parlor Button */}
            <Button
              onClick={onNavigateToParlor}
              className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 rounded-xl border-4 border-orange-800 uppercase cursor-pointer"
              style={{ ...customFontStyle, fontSize: 20 }}
            >
              🍍 OWN A PARLOR 🍍
            </Button>

            {/* Staking Button */}
            <Button
              onClick={onNavigateToStaking}
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-900 uppercase cursor-pointer"
              style={{ ...customFontStyle, fontSize: 20 }}
            >
              <span className="flex items-center justify-center w-full gap-2">
                <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
                <span className="text-center">Spin & Stake</span>
                <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
              </span>
            </Button>

                      </div>
        </Card>
      </div>
    </div>
  )
}
