'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { readContract } from '@wagmi/core'
import { useAccount } from 'wagmi'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { wagmiConfig } from './config/wagmiConfig'
import { enrichLeaderboardWithProfiles, FarcasterProfile } from '../lib/farcasterProfiles'

interface LeaderboardPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToHome?: () => void
}

interface WinnerDisplay {
  address: string
  displayName: string
  amountWon: string
  lifetimeWins: number
  lifetimeVmfWon: string
  farcasterProfile?: FarcasterProfile
  isPlaceholder?: boolean
}

interface LifetimeStatsResult {
  totalWins: number
  totalVmfWon: string
}

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
}

const BASE_CHAIN_ID = 8453

function padWinners(
  list: WinnerDisplay[],
  target: number,
  label: 'daily' | 'weekly'
): WinnerDisplay[] {
  const result = [...list]
  while (result.length < target) {
    result.push({
      address: `placeholder-${label}-${result.length}`,
      displayName: `Waiting for winner #${result.length + 1}`,
      amountWon: '0.0',
      lifetimeWins: 0,
      lifetimeVmfWon: '0.0',
      farcasterProfile: undefined,
      isPlaceholder: true,
    })
  }
  return result
}

function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Placeholder function - divide pot equally
function calculateWinnerPayout(totalPot: bigint, winnerCount: number): string {
  if (!winnerCount) return '0.0'
  const payoutPerWinner = Number(totalPot) / winnerCount / 1e18
  return payoutPerWinner.toFixed(1)
}

function formatLifetimeVmf(amount: bigint): string {
  return (Number(amount) / 1e18).toFixed(1)
}

function sortByLifetimeStats(list: WinnerDisplay[]): WinnerDisplay[] {
  return [...list].sort((a, b) => {
    if (b.lifetimeWins !== a.lifetimeWins) return b.lifetimeWins - a.lifetimeWins
    const aVmf = parseFloat(a.lifetimeVmfWon || '0')
    const bVmf = parseFloat(b.lifetimeVmfWon || '0')
    if (bVmf !== aVmf) return bVmf - aVmf
    return 0
  })
}

async function fetchLifetimeStatsForAddresses(addresses: string[]): Promise<LifetimeStatsResult[]> {
  return Promise.all(
    addresses.map(async addr => {
      try {
        const stats = await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getPlayerLifetimeStats',
          args: [addr as `0x${string}`],  // <-- Changed this line
          chainId: BASE_CHAIN_ID,
        })

        // Wagmi returns an object, not an array
        const statsData = stats as {
          totalDailyWins: bigint
          totalWeeklyWins: bigint
          totalVmfWon: bigint
          lifetimeToppings: bigint
          lifetimeReferrals: bigint
        }
        
        const totalWins = Number(statsData.totalDailyWins) + Number(statsData.totalWeeklyWins)
        const totalVmfWon = formatLifetimeVmf(statsData.totalVmfWon)

        return {
          totalWins,
          totalVmfWon,
        }
      } catch (error) {
        console.error('Failed to fetch lifetime stats:', error)
        return {
          totalWins: 0,
          totalVmfWon: '0.0',
        }
      }
    })
  )
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

  useEffect(() => {
    async function fetchLeaderboardData() {
      try {
        setLoading(true)

        // Fetch current game IDs
        const [dailyId, weeklyId] = await Promise.all([
          readContract(wagmiConfig, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'dailyGameId',
            chainId: BASE_CHAIN_ID,
          }),
          readContract(wagmiConfig, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'weeklyGameId',
            chainId: BASE_CHAIN_ID,
          }),
        ])

        const currentDailyId = dailyId as bigint
        const currentWeeklyId = weeklyId as bigint

        // Fetch previous game (the settled one we want to display)
        const dailyGameIdToFetch = currentDailyId > 1n ? currentDailyId - 1n : currentDailyId
        const weeklyGameIdToFetch = currentWeeklyId > 1n ? currentWeeklyId - 1n : currentWeeklyId

        // Fetch winners and historical game data
        const [dailyWins, weeklyWins, dailyGameDataRaw, weeklyGameDataRaw] = await Promise.all([
          readContract(wagmiConfig, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'getDailyGameWinners',
            args: [dailyGameIdToFetch],
            chainId: BASE_CHAIN_ID,
          }).catch(() => [] as string[]),
          readContract(wagmiConfig, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'getWeeklyGameWinners',
            args: [weeklyGameIdToFetch],
            chainId: BASE_CHAIN_ID,
          }).catch(() => [] as string[]),
          // Fetch historical daily game data
          readContract(wagmiConfig, {
                  address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                  abi: PIZZA_PARTY_ABI,
            functionName: 'dailyGames',
            args: [dailyGameIdToFetch],
                  chainId: BASE_CHAIN_ID,
          }).catch(err => {
            console.error('dailyGames fetch failed', err)
            return null
          }),
          // Fetch historical weekly game data
          readContract(wagmiConfig, {
                  address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                  abi: PIZZA_PARTY_ABI,
            functionName: 'weeklyGames',
            args: [weeklyGameIdToFetch],
                  chainId: BASE_CHAIN_ID,
          }).catch(err => {
            console.error('weeklyGames fetch failed', err)
            return null
          }),
        ])

        const dailyWinnerAddresses = (dailyWins as string[]) || []
        const weeklyWinnerAddresses = (weeklyWins as string[]) || []
        
        // Extract potAmount - wagmi returns objects with named properties
        const dailyPotAmount = (() => {
          if (!dailyGameDataRaw) return 0n
          if (Array.isArray(dailyGameDataRaw)) return (dailyGameDataRaw[3] as bigint) || 0n
          return (dailyGameDataRaw as { potAmount?: bigint }).potAmount || 0n
        })()

        const weeklyPotAmount = (() => {
          if (!weeklyGameDataRaw) return 0n
          if (Array.isArray(weeklyGameDataRaw)) return (weeklyGameDataRaw[3] as bigint) || 0n
          return (weeklyGameDataRaw as { potAmount?: bigint }).potAmount || 0n
        })()

        // Fetch lifetime stats for all winners
        const [dailyLifetimeStats, weeklyLifetimeStats] = await Promise.all([
          fetchLifetimeStatsForAddresses(dailyWinnerAddresses),
          fetchLifetimeStatsForAddresses(weeklyWinnerAddresses),
        ])

        // Build daily winners display data
        const dailyBase: WinnerDisplay[] = dailyWinnerAddresses.map((addr, idx) => ({
          address: addr,
          displayName: formatAddress(addr),
          amountWon: calculateWinnerPayout(dailyPotAmount, dailyWinnerAddresses.length),
          lifetimeWins: dailyLifetimeStats[idx]?.totalWins || 0,
          lifetimeVmfWon: dailyLifetimeStats[idx]?.totalVmfWon || '0.0',
        }))
        const dailySorted = sortByLifetimeStats(dailyBase)

        // Build weekly winners display data
        const weeklyBase: WinnerDisplay[] = weeklyWinnerAddresses.map((addr, idx) => ({
          address: addr,
          displayName: formatAddress(addr),
          amountWon: calculateWinnerPayout(weeklyPotAmount, weeklyWinnerAddresses.length),
          lifetimeWins: weeklyLifetimeStats[idx]?.totalWins || 0,
          lifetimeVmfWon: weeklyLifetimeStats[idx]?.totalVmfWon || '0.0',
        }))
        const weeklySorted = sortByLifetimeStats(weeklyBase)

        const [enrichedDaily, enrichedWeekly] = await Promise.all([
          enrichLeaderboardWithProfiles(dailySorted, address),
          enrichLeaderboardWithProfiles(weeklySorted, address),
        ])

        setDailyWinners(padWinners(enrichedDaily, 8, 'daily'))
        setWeeklyWinners(padWinners(enrichedWeekly, 10, 'weekly'))
      } catch (error) {
        console.error('Failed to fetch leaderboard data:', error)
        setDailyWinners(padWinners([], 8, 'daily'))
        setWeeklyWinners(padWinners([], 10, 'weekly'))
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboardData()
  }, [address])

  // Removed testProfileFetch() to prevent unnecessary API calls
  // useEffect(() => {
  //   async function testProfileFetch() {
  //     const testAddress = '0x1234567890123456789012345678901234567890'
  //     try {
  //       const profiles = await fetchProfilesByAddresses([testAddress])
  //       console.log('Profile fetch test:', profiles)
  //     } catch (error) {
  //       console.error('Profile fetch failed:', error)
  //     }
  //   }
  //
  //   void testProfileFetch()
  // }, [])

  // Profile picture component with error handling - always shows fallback if image fails
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
    
    // Update currentPfpUrl and reset error when pfpUrl changes
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
            key={currentPfpUrl} // Force re-render when URL changes
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
            {isPlaceholder
              ? '⏳'
              : address.slice(2, 4).toUpperCase()}
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
                <span className="text-xs text-gray-600" style={{ ...customFontStyle, whiteSpace: 'nowrap' }}>
                  {winner.lifetimeVmfWon} VMF
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-green-600" style={customFontStyle}>
            {winner.amountWon} VMF
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
            {/* Header */}
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

            {/* Daily Winners Panel */}
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
                    No daily winners yet
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

            {/* Weekly Winners Panel */}
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
                    No weekly winners yet
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

            {/* Action Buttons */}
            <Button
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase"
              style={{ ...customFontStyle, fontSize: 20 }}
              onClick={navigateToDaily}
            >
              <span style={{ fontSize: '24px', marginRight: '4px' }}>🍕</span>
              START PLAYING
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

            {/* How to Get on the Leaderboard */}
            <Card className="border-4 border-red-500 rounded-2xl bg-white/95">
              <div className="p-3">
                <p
                  className="text-red-600 text-xl font-bold mb-2"
                  style={{ ...customFontStyle, textAlign: 'center' }}
                >
                  How to Get on the Leaderboard
                </p>
                <ul className="space-y-1.5 text-red-700 text-sm font-semibold">
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span>Daily Winners: 8 players randomly selected every day at 12pm PST</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span>Weekly Winners: 10 random players selected with weighted probability based on claimed toppings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🍅</span>
                    <span>Earn More Toppings: Play daily, refer friends, and hold VMF coins!</span>
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
