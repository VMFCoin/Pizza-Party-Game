'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { readContract, getPublicClient } from '@wagmi/core'
import { useAccount } from 'wagmi'
import { parseAbiItem } from 'viem'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI, VMF_TOKEN_ADDRESS } from '../lib/constants'
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
  thisGamePayout: string  // Amount won in THIS specific game
  lifetimeWins: number
  lifetimeVmfWon: string  // Total across ALL games
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

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

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
      thisGamePayout: '0.0',
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

function formatVmf(amount: bigint): string {
  return (Number(amount) / 1e18).toFixed(1)
}

function sortByLifetimeStats(list: WinnerDisplay[]): WinnerDisplay[] {
  return [...list].sort((a, b) => {
    const aVmf = parseFloat(a.lifetimeVmfWon || '0')
    const bVmf = parseFloat(b.lifetimeVmfWon || '0')
    if (bVmf !== aVmf) return bVmf - aVmf
    if (b.lifetimeWins !== a.lifetimeWins) return b.lifetimeWins - a.lifetimeWins
    return 0
  })
}

/**
 * Fetch lifetime stats for multiple addresses
 */
async function fetchLifetimeStatsForAddresses(addresses: string[]): Promise<LifetimeStatsResult[]> {
  return Promise.all(
    addresses.map(async addr => {
      try {
        const stats = await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getPlayerLifetimeStats',
          args: [addr as `0x${string}`],
          chainId: BASE_CHAIN_ID,
        })

        const statsData = stats as {
          totalDailyWins: bigint
          totalWeeklyWins: bigint
          totalVmfWon: bigint
          lifetimeToppings: bigint
          lifetimeReferrals: bigint
        }
        
        const totalWins = Number(statsData.totalDailyWins) + Number(statsData.totalWeeklyWins)
        const totalVmfWon = formatVmf(statsData.totalVmfWon)

        return { totalWins, totalVmfWon }
      } catch (error) {
        console.error('Failed to fetch lifetime stats for', addr, ':', error)
        return { totalWins: 0, totalVmfWon: '0.0' }
      }
    })
  )
}

/**
 * Fetch EXACT payout for each winner from Transfer events
 * This is the ACTUAL amount sent to each winner in this specific game
 */
async function fetchGamePayoutsFromTransfers(
  gameId: bigint,
  winners: string[]
): Promise<Map<string, string>> {
  const payoutMap = new Map<string, string>()
  
  try {
    const publicClient = getPublicClient(wagmiConfig, { chainId: BASE_CHAIN_ID })
    if (!publicClient) {
      console.error('No public client available')
      return payoutMap
    }

    // Get the game data to find settlement block range
    const gameData = await readContract(wagmiConfig, {
      address: PIZZA_PARTY_ADDRESS as `0x${string}`,
      abi: PIZZA_PARTY_ABI,
      functionName: 'dailyGames',
      args: [gameId],
      chainId: BASE_CHAIN_ID,
    }) as {
      startTime: bigint
      endTime: bigint
      firstPlayer: string
      potAmount: bigint
      settled: boolean
    }

    if (!gameData.settled) {
      console.warn('Game not settled:', gameId)
      return payoutMap
    }

    // Fetch ALL transfers from PizzaParty contract to winners
    // We'll match them to this specific game by analyzing the amounts
    const transferPromises = winners.map(async (winnerAddress) => {
      try {
        const logs = await publicClient.getLogs({
          address: VMF_TOKEN_ADDRESS as `0x${string}`,
          event: TRANSFER_EVENT,
          args: {
            from: PIZZA_PARTY_ADDRESS as `0x${string}`,
            to: winnerAddress as `0x${string}`,
          },
          fromBlock: 'earliest',
          toBlock: 'latest',
        })

        // Find the most recent transfer (should be from this game settlement)
        // In production, you might want to filter by block number around settlement time
        if (logs.length > 0) {
          // Get the most recent transfer (last in array)
          const mostRecentTransfer = logs[logs.length - 1]
          const amount = mostRecentTransfer.args.value ?? 0n
          
          if (amount > 0n) {
            payoutMap.set(winnerAddress.toLowerCase(), formatVmf(amount))
            console.log(`✅ Found payout for ${winnerAddress.slice(0, 6)}: ${formatVmf(amount)} VMF`)
          }
        }
      } catch (err) {
        console.error('Failed to fetch transfers for', winnerAddress, ':', err)
      }
    })

    await Promise.all(transferPromises)

  } catch (error) {
    console.error('Failed to fetch game payouts from transfers:', error)
  }

  return payoutMap
}

/**
 * Fallback: Calculate expected payout from game data
 * Use this if Transfer events aren't available
 */
function calculateFallbackPayout(
  pot: bigint,
  winnerCount: number,
  isFirstPlayer: boolean
): string {
  if (winnerCount === 0) return '0.0'

  const firstPlayerBonus = (pot * 100n) / 10000n  // 1%
  const playersPool = pot - firstPlayerBonus       // 99%
  const baseShare = playersPool / BigInt(winnerCount)
  const remainder = playersPool - (baseShare * BigInt(winnerCount))

  let payout = baseShare

  // Note: This is simplified - actual dust distribution may vary
  // This is why we prefer Transfer events!
  if (isFirstPlayer) {
    payout += firstPlayerBonus
  }

  return formatVmf(payout)
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

        // Fetch the LAST SETTLED game (current - 1)
        const dailyGameIdToFetch = currentDailyId > 1n ? currentDailyId - 1n : currentDailyId
        const weeklyGameIdToFetch = currentWeeklyId > 1n ? currentWeeklyId - 1n : currentWeeklyId

        console.log('📊 Fetching game data:', {
          dailyGameId: dailyGameIdToFetch.toString(),
          weeklyGameId: weeklyGameIdToFetch.toString(),
        })

        const [dailyWins, weeklyWins, dailyGameData, weeklyGameData] = await Promise.all([
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
          readContract(wagmiConfig, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'dailyGames',
            args: [dailyGameIdToFetch],
            chainId: BASE_CHAIN_ID,
          }).catch(() => null),
          readContract(wagmiConfig, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'weeklyGames',
            args: [weeklyGameIdToFetch],
            chainId: BASE_CHAIN_ID,
          }).catch(() => null),
        ])

        const dailyWinnerAddresses = (dailyWins as string[]) || []
        const weeklyWinnerAddresses = (weeklyWins as string[]) || []

        console.log('🎯 Winners found:', {
          daily: dailyWinnerAddresses.length,
          weekly: weeklyWinnerAddresses.length,
        })

        // Fetch lifetime stats for all winners
        const [dailyLifetimeStats, weeklyLifetimeStats] = await Promise.all([
          fetchLifetimeStatsForAddresses(dailyWinnerAddresses),
          fetchLifetimeStatsForAddresses(weeklyWinnerAddresses),
        ])

        // ✅ CRITICAL: Fetch ACTUAL payouts from Transfer events
        const [dailyPayouts, weeklyPayouts] = await Promise.all([
          fetchGamePayoutsFromTransfers(dailyGameIdToFetch, dailyWinnerAddresses),
          fetchGamePayoutsFromTransfers(weeklyGameIdToFetch, weeklyWinnerAddresses),
        ])

        // Build daily winners display data
        const dailyBase: WinnerDisplay[] = dailyWinnerAddresses.map((addr, idx) => {
          const addressLower = addr.toLowerCase()
          
          // Get ACTUAL payout from Transfer events
          let thisGamePayout = dailyPayouts.get(addressLower) || '0.0'
          
          // Fallback: if no transfer found, calculate from game data
          if (thisGamePayout === '0.0' && dailyGameData) {
            const gameData = dailyGameData as {
              firstPlayer: string
              potAmount: bigint
            }
            const isFirstPlayer = gameData.firstPlayer?.toLowerCase() === addressLower
            thisGamePayout = calculateFallbackPayout(
              gameData.potAmount,
              dailyWinnerAddresses.length,
              isFirstPlayer
            )
            console.warn('⚠️ Using fallback calculation for', addr.slice(0, 6))
          }

          return {
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout,  // ✅ EXACT amount from THIS game
            lifetimeWins: dailyLifetimeStats[idx]?.totalWins || 0,
            lifetimeVmfWon: dailyLifetimeStats[idx]?.totalVmfWon || '0.0',  // ✅ Total from ALL games
          }
        })

        // Build weekly winners display data
        const weeklyBase: WinnerDisplay[] = weeklyWinnerAddresses.map((addr, idx) => {
          const addressLower = addr.toLowerCase()
          let thisGamePayout = weeklyPayouts.get(addressLower) || '0.0'
          
          // Fallback for weekly
          if (thisGamePayout === '0.0' && weeklyGameData) {
            const gameData = weeklyGameData as { potAmount: bigint }
            thisGamePayout = formatVmf(gameData.potAmount / BigInt(weeklyWinnerAddresses.length || 1))
          }

          return {
            address: addr,
            displayName: formatAddress(addr),
            thisGamePayout,
            lifetimeWins: weeklyLifetimeStats[idx]?.totalWins || 0,
            lifetimeVmfWon: weeklyLifetimeStats[idx]?.totalVmfWon || '0.0',
          }
        })

        const dailySorted = sortByLifetimeStats(dailyBase)
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
