'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { enrichLeaderboardWithProfiles, FarcasterProfile } from '../lib/farcasterProfiles'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { formatUnits } from 'viem'

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

  // Old contract address for historical data (Game 12 and earlier)
  const OLD_CONTRACT_ADDRESS = '0x5c3aaD450F0014292Ff363b2147e6571b16c8035'

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

  // Determine which contract to read from based on game ID
  const currentDailyId = dailyGameId ? Number(dailyGameId) : 13
  const currentWeeklyId = weeklyGameId ? Number(weeklyGameId) : 3
  const previousDailyGameId = currentDailyId - 1 // Game 12
  const previousWeeklyGameId = currentWeeklyId - 1 // Weekly 2

  // Game 12 was on the OLD contract, Game 13+ on new contract
  const dailyContractAddress = previousDailyGameId <= 12 ? OLD_CONTRACT_ADDRESS : PIZZA_PARTY_ADDRESS
  const weeklyContractAddress = previousWeeklyGameId <= 2 ? OLD_CONTRACT_ADDRESS : PIZZA_PARTY_ADDRESS

  const { data: dailyWinnersAddresses } = useReadContract({
    address: dailyContractAddress as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getDailyGameWinners',
    args: [BigInt(previousDailyGameId)],
  })

  const { data: weeklyWinnersAddresses } = useReadContract({
    address: weeklyContractAddress as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'getWeeklyGameWinners',
    args: [BigInt(previousWeeklyGameId)],
  })

  const { data: previousDailyGame } = useReadContract({
    address: dailyContractAddress as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGames',
    args: [BigInt(previousDailyGameId)],
  })

  const { data: previousWeeklyGame } = useReadContract({
    address: weeklyContractAddress as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'weeklyGames',
    args: [BigInt(previousWeeklyGameId)],
  })

  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        setLoading(true)

        // Build daily winners from contract data
        const dailyAddresses = (dailyWinnersAddresses as string[]) || []
        const dailyPot = previousDailyGame ? (previousDailyGame as any).potAmount : 0n
        const dailyPayoutPerWinner = dailyAddresses.length > 0
          ? Number(formatUnits(BigInt(dailyPot) * 94n / 100n / BigInt(dailyAddresses.length), 18)).toFixed(1)
          : '0'

        const dailyPlayersData: WinnerDisplay[] = dailyAddresses.map((addr: string) => ({
          address: addr,
          displayName: formatAddress(addr),
          thisGamePayout: dailyPayoutPerWinner,
          lifetimeWins: 0, // Will be enriched below
          lifetimeVmfWon: '0',
        }))

        // Build weekly winners from contract data
        const weeklyAddresses = (weeklyWinnersAddresses as string[]) || []
        const weeklyPot = previousWeeklyGame ? (previousWeeklyGame as any).potAmount : 0n
        const weeklyPayoutPerWinner = weeklyAddresses.length > 0
          ? Number(formatUnits(BigInt(weeklyPot) / BigInt(weeklyAddresses.length), 18)).toFixed(1)
          : '0'

        const weeklyPlayersData: WinnerDisplay[] = weeklyAddresses.map((addr: string) => ({
          address: addr,
          displayName: formatAddress(addr),
          thisGamePayout: weeklyPayoutPerWinner,
          lifetimeWins: 0,
          lifetimeVmfWon: '0',
        }))

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

    if (dailyWinnersAddresses !== undefined || weeklyWinnersAddresses !== undefined) {
      fetchLeaderboardData()
    }
  }, [address, dailyWinnersAddresses, weeklyWinnersAddresses, previousDailyGame, previousWeeklyGame])

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
