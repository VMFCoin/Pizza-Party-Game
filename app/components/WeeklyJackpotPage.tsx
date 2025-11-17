'use client'

import { useEffect, useMemo, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { useGamePageData } from '../lib/useGamePageData'

interface WeeklyJackpotPageProps {
  onBack?: () => void
  onNavigateToHome?: () => void
  onNavigateToDaily?: () => void
}

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
}

const HOW_TO_WIN = [
  'Play Daily: 1 topping each day you play',
  'Refer new players: 2 toppings per referral (max 3 per week)',
  'Hold VMF tokens: 3 toppings for every 10,000 VMF you hold',
  'More toppings = more tickets in the weekly draw',
]

const TERMS = [
  'Daily Game Rules: One entry per wallet per day. The 24-hour window resets at 12pm PST.',
  'Daily Chances: Every entry has the same odds to win regardless of holdings.',
  'Prerequisite to qualify: Wallet must hold VMF tokens to participate.',
  'All winners split the jackpot equally each day.',
  'Daily Jackpot: 8 winners selected randomly from that day’s players at 12pm PST; prizes auto-paid.',
  'Weekly Jackpot: 10 winners selected with weighted odds based on toppings at Monday 12pm PST.',
  'Toppings expire & refresh weekly—use them or lose them before the next claim window.',
  'Topping Claim Window: Sunday 12pm PST through Monday 12pm PST.',
  'Weekly Jackpot: Claim toppings before the window closes to be entered.',
  'Weekly jackpot equals total toppings claimed (1 topping = 1 VMF).',
]

const PACIFIC_TZ = 'America/Los_Angeles'

function getNextMondayNoonPacificTimestamp(): number {
  const now = new Date()
  const pacificNow = toZonedTime(now, PACIFIC_TZ)
  const target = new Date(
    pacificNow.getFullYear(),
    pacificNow.getMonth(),
    pacificNow.getDate(),
    12,
    0,
    0,
    0
  )
  const day = pacificNow.getDay() // Sunday = 0, Monday = 1
  let daysUntilMonday = (1 - day + 7) % 7
  if (daysUntilMonday === 0 && pacificNow >= target) {
    daysUntilMonday = 7
  }
  target.setDate(target.getDate() + daysUntilMonday)
  const utcDate = fromZonedTime(target, PACIFIC_TZ)
  return Math.floor(utcDate.getTime() / 1000)
}

function useCountdown(targetSeconds: number) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    if (!targetSeconds) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 }
    }
    const diff = Math.max(0, targetSeconds * 1000 - now)
    const totalSeconds = Math.floor(diff / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return { days, hours, minutes, seconds }
  }, [targetSeconds, now])
}

export default function WeeklyJackpotPage({
  onBack: _unusedOnBack,
  onNavigateToHome: _unusedOnNavigateToHome,
  onNavigateToDaily,
}: WeeklyJackpotPageProps) {
  const {
    wallet,
    weekly,
    playerWeekly,
    claimableToppings,
    handleClaimToppings,
    isEntryInProgress,
  } = useGamePageData()

  const weeklyPlayersDisplay = Number.isNaN(weekly.claimerCount)
    ? 0
    : weekly.claimerCount

  // Countdown target follows on-chain weekly schedule from PizzaPartyMinimal.sol.
  // We fall back to the next Monday 12pm PST if on-chain data hasn't loaded yet.
  const { claimStart, claimEnd } = weekly
  const countdownTarget = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000)

    if (!claimStart && !claimEnd) {
      return getNextMondayNoonPacificTimestamp()
    }

    if (claimStart && nowSec < claimStart) return claimStart
    if (claimEnd && nowSec < claimEnd) return claimEnd

    if (claimStart) return claimStart + 7 * 24 * 60 * 60
    if (claimEnd) return claimEnd + 7 * 24 * 60 * 60

    return getNextMondayNoonPacificTimestamp()
  }, [claimStart, claimEnd])
  const countdown = useCountdown(countdownTarget)

  const claimableNumber = Number(claimableToppings)
  const hasClaimed = playerWeekly?.hasClaimed ?? false
  const nowSec = Math.floor(Date.now() / 1000)
  const claimWindowOpen =
    claimStart > 0 && nowSec >= claimStart && nowSec < claimEnd
  const jackpotVmF = Number(weekly.jackpotWei) / 1e18
  const jackpotDisplay =
    weekly.jackpotWei > 0n ? jackpotVmF.toFixed(jackpotVmF >= 1 ? 0 : 2) : '0'
  const claimButtonDisabled =
    !wallet?.isAuthenticated || !claimWindowOpen || hasClaimed || claimableNumber <= 0 || isEntryInProgress

  const claimButtonLabel = wallet?.isAuthenticated
    ? `🍕 Claim ${claimableNumber} Toppings 🍕`
    : 'Connect wallet to claim'

  return (
    <div
      className="min-h-screen p-3 flex flex-col items-center"
      style={{
        backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="w-full max-w-md flex flex-col gap-3">
        <Card
          className="border-4 border-red-700 rounded-3xl shadow-2xl p-3 !bg-transparent"
          style={{
            backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="flex flex-col gap-3">
          <div className="rounded-2xl border-4 border-red-500 p-3 text-center bg-white">
            <h1
              className="mb-2"
              style={{
                padding: '3px',
                textAlign: 'center',
                transform: '-rotate-2',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  ...customFontStyle,
                  color: '#DC2626',
                  textShadow:
                    '2px 2px 0px #991B1B, 3px 3px 0px #7F1D1D, 4px 4px 2px rgba(0,0,0,0.25)',
                  letterSpacing: '0px',
                  fontWeight: '900',
                  WebkitTextStroke: '1px #450A0A',
                  background: 'linear-gradient(45deg, #DC2626, #EF4444, #F87171)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 1px #DC2626)',
                  fontSize: '44px',
                  whiteSpace: 'nowrap',
                }}
              >
                Weekly Jackpot
              </div>
              <div
                style={{
                  ...customFontStyle,
                  color: '#DC2626',
                  textShadow:
                    '2px 2px 0px #991B1B, 3px 3px 0px #7F1D1D, 4px 4px 2px rgba(0,0,0,0.25)',
                  letterSpacing: '-1px',
                  fontWeight: '900',
                  WebkitTextStroke: '1px #450A0A',
                  background: 'linear-gradient(45deg, #DC2626, #EF4444, #F87171)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 1px #DC2626)',
                  fontSize: '36px',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                Collect toppings to win!
              </div>
            </h1>
          </div>

          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl p-3 text-center border-4 border-yellow-600">
            <p className="text-white text-xl font-bold" style={customFontStyle}>
              Weekly Jackpot
            </p>
            <p className="text-white text-4xl font-black" style={customFontStyle}>
              {jackpotDisplay} VMF
            </p>
            <p className="text-white text-sm font-semibold mt-2" style={customFontStyle}>
              Weekly Players {weeklyPlayersDisplay}
            </p>
          </div>

          <div className="bg-blue-50 border-4 border-blue-200 rounded-2xl p-3 text-center">
            <div className="flex justify-center items-center gap-2 mb-2">
              <Image src="/images/alarm-clock-icon.png" alt="Clock" width={20} height={20} />
              <span className="text-blue-700 font-bold text-lg" style={customFontStyle}>
                Next Draw In:
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'DAYS', value: countdown.days },
                { label: 'HRS', value: countdown.hours },
                { label: 'MIN', value: countdown.minutes },
                { label: 'SEC', value: countdown.seconds },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-xl border-2 border-blue-200 py-2">
                  <p className="text-blue-800 text-xl font-bold" style={customFontStyle}>
                    {item.value}
                  </p>
                  <p className="text-blue-500 text-xs font-semibold">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="text-blue-600 text-xs mt-2" style={customFontStyle}>
              Draw happens every Monday at 12pm PST
            </p>
          </div>

          <Button
            className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-2.5 rounded-xl border-4 border-red-800"
            style={customFontStyle}
            disabled={claimButtonDisabled}
            onClick={() => {
              if (!claimButtonDisabled) {
                handleClaimToppings()
              }
            }}
          >
            {claimWindowOpen ? claimButtonLabel : 'CLAIM WINDOW CLOSED'}
          </Button>

          <Button
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800"
            style={customFontStyle}
            onClick={onNavigateToDaily}
          >
            🍕 START PLAYING 🍕
          </Button>

          <Button
            className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase"
            style={customFontStyle}
            onClick={() => alert('Leaderboard coming soon!')}
          >
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            LEADERBOARD
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
          </Button>

          <Card className="border-4 border-red-500 rounded-2xl bg-white/95">
            <div className="p-3">
              <p className="text-red-600 text-xl font-bold text-center mb-2" style={customFontStyle}>
                🍕 How to Win Toppings 🍕
              </p>
              <ul className="space-y-1.5 text-red-700 text-sm font-semibold">
                {HOW_TO_WIN.map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span>🍅</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="border-4 border-yellow-600 rounded-2xl bg-white/95">
            <div className="p-3">
              <p className="text-yellow-600 text-xl font-bold text-center mb-2" style={customFontStyle}>
                📋 Terms
              </p>
              <ul className="space-y-1.5 text-yellow-800 text-sm font-semibold">
                {TERMS.map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span>🍅</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          </div>
        </Card>
      </div>
    </div>
  )
}
