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
import { fetchUserProfileCached } from '../lib/userProfileLookup'
import { fetchDailyPayouts, fetchWeeklyPayouts, formatPayout } from '../lib/payoutCalculator'

interface LeaderboardPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToHome?: () => void
}

interface WinnerDisplay {
  address: string
  username: string
  pfpUrl: string
  amountWon: string
  isPlaceholder?: boolean
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
      username: `Waiting for winner #${result.length + 1}`,
      pfpUrl: '',
      amountWon: '0.0',
      isPlaceholder: true,
    })
  }
  return result
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
      icon: '👑',
      textColor: 'text-yellow-900',
    }
  }
  if (position === 2) {
    return {
      bg: 'bg-gradient-to-r from-gray-300 to-gray-400',
      border: 'border-gray-500',
      icon: '🥈',
      textColor: 'text-gray-800',
    }
  }
  if (position === 3) {
    return {
      bg: 'bg-gradient-to-r from-orange-400 to-orange-500',
      border: 'border-orange-600',
      icon: '🥉',
      textColor: 'text-orange-900',
    }
  }
  return {
    bg: 'bg-white',
    border: 'border-gray-300',
    icon: '🏆',
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

        const dailyGameIdToFetch = currentDailyId > 1n ? currentDailyId - 1n : currentDailyId
        const weeklyGameIdToFetch = currentWeeklyId > 1n ? currentWeeklyId - 1n : currentWeeklyId

        // Fetch winners for previous games (latest settled)
        const [dailyWins, weeklyWins] = await Promise.all([
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
        ])

        const dailyWinnerAddresses = (dailyWins as string[]) || []
        const weeklyWinnerAddresses = (weeklyWins as string[]) || []

        const [dailyPayoutMap, weeklyPayoutMap] = await Promise.all([
          fetchDailyPayouts(dailyGameIdToFetch),
          fetchWeeklyPayouts(weeklyGameIdToFetch),
        ])

        // Fetch user profiles for all winners
        const [dailyProfiles, weeklyProfiles] = await Promise.all([
          Promise.all(dailyWinnerAddresses.map(addr => fetchUserProfileCached(addr))),
          Promise.all(weeklyWinnerAddresses.map(addr => fetchUserProfileCached(addr))),
        ])

        // Build daily winners display data
        const dailyDisplay: WinnerDisplay[] = dailyWinnerAddresses.map((addr, idx) => ({
          address: addr,
          username: dailyProfiles[idx].username,
          pfpUrl: dailyProfiles[idx].pfpUrl,
          amountWon: formatPayout(dailyPayoutMap.get(addr.toLowerCase()) || 0n),
        }))

        // Build weekly winners display data
        const weeklyDisplay: WinnerDisplay[] = weeklyWinnerAddresses.map((addr, idx) => ({
          address: addr,
          username: weeklyProfiles[idx].username,
          pfpUrl: weeklyProfiles[idx].pfpUrl,
          amountWon: formatPayout(weeklyPayoutMap.get(addr.toLowerCase()) || 0n),
        }))

        setDailyWinners(padWinners(dailyDisplay, 8, 'daily'))
        setWeeklyWinners(padWinners(weeklyDisplay, 10, 'weekly'))
      } catch (error) {
        console.error('Failed to fetch leaderboard data:', error)
        setDailyWinners(padWinners([], 8, 'daily'))
        setWeeklyWinners(padWinners([], 10, 'weekly'))
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboardData()
  }, [])

  const renderWinnerRow = (winner: WinnerDisplay, position: number) => {
    const style = getPositionStyle(position)
    const isPlaceholder = !!winner.isPlaceholder
    const isCurrentUser = !isPlaceholder && address?.toLowerCase() === winner.address.toLowerCase()

    return (
      <div
        key={winner.address}
        className={`flex items-center justify-between p-2 rounded-xl border-2 ${style.bg} ${style.border} shadow-md`}
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-1 min-w-[40px]">
            <span className="text-2xl">{isPlaceholder ? '⏳' : style.icon}</span>
            <span className={`text-lg font-bold ${style.textColor}`} style={customFontStyle}>
              {position}.
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gray-200 border-2 border-gray-300 flex items-center justify-center overflow-hidden">
            {!isPlaceholder && winner.pfpUrl ? (
              <Image
                src={winner.pfpUrl}
                alt="Profile"
                width={36}
                height={36}
                className="object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-500">
                <circle cx="12" cy="7.5" r="3.5" fill="currentColor" />
                <path d="M4 20c0-3.5 3.2-6.5 8-6.5s8 3 8 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div className="flex flex-col">
            <span
              className={`font-bold text-base ${isPlaceholder ? 'text-gray-500' : isCurrentUser ? 'text-red-600' : style.textColor}`}
              style={customFontStyle}
            >
              {winner.username}
            </span>
            <span className="text-xs text-gray-600" style={customFontStyle}>
              {isPlaceholder ? 'Awaiting winner…' : formatAddress(winner.address)}
            </span>
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
            <div className="rounded-2xl border-4 border-red-500 text-center bg-white" style={{ padding: '12px 16px' }}>
              <h1
                style={{
                  ...customFontStyle,
                  color: '#DC2626',
                  textShadow:
                    '2px 2px 0px #991B1B, 3px 3px 0px #7F1D1D, 4px 4px 2px rgba(0,0,0,0.25)',
                  letterSpacing: '1.5px',
                  fontWeight: '900',
                  WebkitTextStroke: '1px #450A0A',
                  background: 'linear-gradient(45deg, #DC2626, #EF4444, #F87171)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 0.125px #DC2626)',
                  fontSize: 'clamp(22px, 8vw, 46px)',
                  whiteSpace: 'normal',
                  lineHeight: 1.1,
                }}
              >
                LEADERBOARD
              </h1>
              <p className="text-black text-sm font-semibold mt-1" style={customFontStyle}>
                See who&apos;s winning the most VMF tokens!
              </p>
            </div>

            {/* Daily Winners Panel */}
            <Card className="border-4 border-black rounded-2xl bg-blue-50/95 shadow-lg">
              <div className="px-4" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
                <div className="flex items-center justify-center gap-1 mb-1 text-center">
                  <span className="text-2xl">🎯</span>
                  <h2
                    className="text-blue-700 text-2xl font-bold text-center"
                    style={{ ...customFontStyle, fontSize: 'clamp(20px, 8vw, 28px)' }}
                  >
                    DAILY WINNERS
                  </h2>
                  <span className="text-2xl">🎯</span>
                </div>
                <p className="text-blue-600 text-base font-semibold mb-2 text-center" style={customFontStyle}>
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
                    {dailyWinners.map((winner, index) => renderWinnerRow(winner, index + 1))}
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
                    className="text-purple-700 text-2xl font-bold text-center"
                    style={{ ...customFontStyle, fontSize: 'clamp(20px, 8vw, 28px)' }}
                  >
                    WEEKLY WINNERS
                  </h2>
                  <span className="text-2xl">🍕</span>
                </div>
                <p className="text-purple-600 text-base font-semibold mb-4 text-center" style={customFontStyle}>
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
                    {weeklyWinners.map((winner, index) => renderWinnerRow(winner, index + 1))}
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
                <p className="text-red-600 text-xl font-bold text-center mb-2" style={customFontStyle}>
                  🍕 How to Get on the Leaderboard 🍕
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
                    <span>Earn More Toppings: Play daily, refer friends, and hold VMF tokens!</span>
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
