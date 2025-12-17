'use client'

import { useEffect, useMemo, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'
import { useGamePageData } from '../lib/useGamePageData'
import ToppingBreakdownModal from './ToppingBreakdownModal'

interface WeeklyJackpotPageProps {
  onBack?: () => void
  onNavigateToHome?: () => void
  onNavigateToDaily?: () => void
  onNavigateToLeaderboard?: () => void
}

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
}

const HOW_TO_WIN = [
  'Play Daily: 1 topping each day you play',
  'Refer new players: 2 toppings per referral (max 3 per week)',
  'Hold PIZZA tokens: 3 toppings for every $10 of PIZZA you hold',
  'More toppings = more tickets in the weekly draw',
]

const TERMS = {
  title: 'Pizza Party Terms',
  dailyGame: [
    'Must hold PIZZA tokens to play',
    'One entry per wallet per day (resets 12pm PST)',
    'Equal odds for all players regardless of holdings',
    '8 winners randomly selected daily at 12pm PST',
    'Daily jackpot split equally among winners; prizes auto-paid',
    'New games are called when a new player enters after 12pm PST',
    'Partnered veteran charities receive 3% of the daily jackpot',
  ],
  weeklyJackpot: [
    'Claim toppings during Sunday 12pm–Monday 12pm PST to enter',
    '10 winners selected Monday 12pm PST with odds weighted by toppings claimed',
    'Total jackpot = total toppings claimed (1 topping = 100 PIZZA)',
    'Unclaimed toppings expire weekly—claim or lose them',
  ],
}

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
  onNavigateToHome,
  onNavigateToDaily,
  onNavigateToLeaderboard,
}: WeeklyJackpotPageProps) {
  const {
    wallet,
    weekly,
    playerWeekly,
    claimableToppings,
    handleClaimToppings,
    isEntryInProgress,
    pizzaUsd,
  } = useGamePageData()
  const [isMobile, setIsMobile] = useState(false)
  const [showToppingBreakdown, setShowToppingBreakdown] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const weeklyPlayersDisplay =
    weekly.projectedPlayerCount > 0
      ? weekly.projectedPlayerCount
      : Number.isNaN(weekly.claimerCount)
        ? 0
        : weekly.claimerCount

  // Countdown target follows on-chain weekly schedule from PizzaPartyMinimal.sol.
  // The draw happens at Monday 12pm PST (claimEnd), so we always countdown to that.
  // We fall back to the next Monday 12pm PST if on-chain data hasn't loaded yet.
  const { claimStart, claimEnd } = weekly
  const countdownTarget = (() => {
    const nowSec = Math.floor(Date.now() / 1000)

    // Always countdown to claimEnd (Monday 12pm PST when draw happens)
    if (claimEnd && nowSec < claimEnd) {
      return claimEnd
    }

    // If we're past claimEnd, calculate next Monday 12pm PST
    if (claimEnd) {
      return claimEnd + 7 * 24 * 60 * 60
    }

    // Fallback if no on-chain data
    return getNextMondayNoonPacificTimestamp()
  })()
  const countdown = useCountdown(countdownTarget)

  const claimableNumber = Number(claimableToppings)
  const hasClaimed = playerWeekly?.hasClaimed ?? false
  const nowSec = Math.floor(Date.now() / 1000)
  const claimWindowOpen =
    claimStart > 0 && nowSec >= claimStart && nowSec < claimEnd
  const jackpotWeiToDisplay =
    weekly.projectedJackpotWei > weekly.jackpotWei ? weekly.projectedJackpotWei : weekly.jackpotWei
  const jackpotPizza = Number(jackpotWeiToDisplay) / 1e18
  const jackpotUsdValue = jackpotPizza * pizzaUsd
  const jackpotDisplay = jackpotUsdValue.toFixed(2)
  const claimButtonDisabled =
    !wallet?.isAuthenticated || !claimWindowOpen || hasClaimed || claimableNumber <= 0 || isEntryInProgress

  const claimButtonLabel = wallet?.isAuthenticated
    ? `🍕 Claim ${claimableNumber} Toppings 🍕`
    : 'Connect wallet to claim'

  // Calculate topping breakdown
  const dailyPlayToppings = Number(playerWeekly?.dailyPlays ?? 0n) * 1
  const referralToppings = Number(playerWeekly?.referralsUsed ?? 0n) * 2
  const holdingsToppings = Number(playerWeekly?.projectedHoldingsBonus ?? 0n)
  const totalToppingsBeforeClaim = dailyPlayToppings + referralToppings + holdingsToppings

  const handleOpenToppingBreakdown = () => {
    if (!claimButtonDisabled) {
      setShowToppingBreakdown(true)
    }
  }

  const handleClaimFromModal = () => {
    setShowToppingBreakdown(false)
    handleClaimToppings()
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
            <div className="relative w-full" style={{ paddingBottom: isMobile ? '21%' : '30%', minHeight: isMobile ? '98px' : '140px' }}>
              <Image
                src="/images/WeeklyCard.png"
                alt="Weekly Jackpot - Collect toppings to win!"
                fill
                className="object-cover"
                priority
                sizes="100vw"
                style={{ objectPosition: 'center 48%' }}
              />
            </div>
          </div>

          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl px-3 py-1.5 text-center border-4 border-yellow-600" style={{ borderColor: '#000000' }}>
            <p className="text-white font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '28px', lineHeight: '1', marginBottom: '4px' }}>
              Weekly Jackpot
            </p>
            <p className="text-white text-4xl font-black" style={{ fontFamily: 'var(--font-luckiest-guy)', lineHeight: '1', margin: '0', padding: '0' }}>
              ${jackpotDisplay}
            </p>
            <p className="text-white text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)', marginTop: '4px' }}>
              Weekly Players {weeklyPlayersDisplay}
            </p>
          </div>

          <div className="bg-blue-50 border-4 border-blue-200 rounded-2xl px-3 py-2 text-center" style={{ borderColor: '#000000' }}>
            <div className="flex justify-center items-center mb-1">
              <span className="text-blue-700 text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '22px' }}>
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
                <div key={item.label} className="bg-white rounded-xl border-2 border-blue-200 py-2" style={{ borderColor: '#000000' }}>
                  <p className="text-blue-800 text-xl font-bold" style={customFontStyle}>
                    {item.value}
                  </p>
                  <p className="text-blue-500 text-xs font-semibold">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="text-blue-600 text-xs mt-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              Draw happens every Monday at 12pm PST
            </p>
          </div>

          <Button
            className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-2.5 rounded-xl border-4 border-red-800"
            style={customFontStyle}
            disabled={claimButtonDisabled}
            onClick={handleOpenToppingBreakdown}
          >
            {claimWindowOpen ? claimButtonLabel : 'CLAIM WINDOW CLOSED'}
          </Button>

          <Button
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800"
            style={{ ...customFontStyle, fontSize: 20 }}
            onClick={onNavigateToDaily}
          >
            🍕 GRAB A SLICE 🍕
          </Button>

          <Button
            className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase"
            style={{ ...customFontStyle, fontSize: 20 }}
            onClick={() => {
              if (onNavigateToLeaderboard) {
                onNavigateToLeaderboard()
                return
              }
              alert('Leaderboard coming soon!')
            }}
          >
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            LEADERBOARD
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
          </Button>

          <Card className="border-4 border-red-500 rounded-2xl bg-white/95">
            <div className="px-3 pb-3 pt-1.5">
              <p className="text-red-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px' }}>
                How to Win Toppings
              </p>
              <ul className="space-y-1.5 text-red-700 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
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
            <div className="px-3 pb-3 pt-1.5">
              <p className="text-yellow-600 text-center mb-3" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px' }}>
                {TERMS.title}
              </p>
              
              <div className="mb-4">
                <p className="text-yellow-700 text-base mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  Daily Game
                </p>
                <ul className="space-y-1.5 text-yellow-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  {TERMS.dailyGame.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span>🍅</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-yellow-700 text-base mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  Weekly Jackpot
                </p>
                <ul className="space-y-1.5 text-yellow-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  {TERMS.weeklyJackpot.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span>🍅</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          </div>
        </Card>
      </div>

      {/* Topping Breakdown Modal */}
      <ToppingBreakdownModal
        isOpen={showToppingBreakdown}
        onClose={() => setShowToppingBreakdown(false)}
        dailyPlayToppings={dailyPlayToppings}
        referralToppings={referralToppings}
        holdingsToppings={holdingsToppings}
        totalToppings={totalToppingsBeforeClaim}
        isLoading={isEntryInProgress}
        onClaim={handleClaimFromModal}
        isMobile={isMobile}
      />
    </div>
  )
}
