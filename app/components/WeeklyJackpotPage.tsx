'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, X } from 'lucide-react'
import { readContract } from '@wagmi/core'
import { sdk } from '@farcaster/miniapp-sdk'
import { useGamePageData } from '../lib/useGamePageData'
import { PIZZA_STAKING_ADDRESS, PIZZA_STAKING_ABI, SHARE_AND_SPIN_ADDRESS, SHARE_AND_SPIN_ABI } from '../lib/constants'
import { wagmiConfig } from './config/wagmiConfig'
import ToppingBreakdownModal from './ToppingBreakdownModal'
import { hasEarlyAccess } from '../lib/constants/earlyAccess'


interface WeeklyJackpotPageProps {
  onBack?: () => void
  onNavigateToHome?: () => void
  onNavigateToDaily?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToParlor?: () => void
  onNavigateToStaking?: () => void
  isBanned?: boolean
  userFid?: number | null
  neynarScoreAllowed?: boolean
  neynarScoreLoading?: boolean
  neynarScoreReason?: string | null
}

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

const HOW_TO_WIN = [
  '1 Topping = 1 ticket in the weekly draw',
  'Play Daily: 1 topping per day + 3 bonus for playing all 7 days (10 max)',
  'Refer new players: 2 toppings per referral (max 3 per week)',
  'Hold PIZZA tokens: 1 topping for every $10 of PIZZA you hold (5 toppings max)',
  'Staking Tier Bonus: +1/+3/+5 toppings per week based on your staking tier',
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
    'Daily pot breakdown: 80% Public, 10% Stakers, 7% Parlor Owners, 3% Charities',
  ],
  weeklyJackpot: [
    'Weekly Jackpot is a group collective game',
    'Weekly jackpot starts at $20; claimed toppings add to the jackpot (1\u00A0topping\u00A0=\u00A0$0.10\u00A0of\u00A0PIZZA)',
    'Claim toppings Sunday 12pm–Monday 12pm PST to enter',
    'One paid daily entry ($1 of PIZZA) per week is required to claim toppings',
    '10 winners selected Monday 12pm PST with odds weighted by toppings claimed',
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
  onNavigateToParlor,
  onNavigateToStaking,
  isBanned,
  userFid,
  neynarScoreAllowed = false,
  neynarScoreLoading = true,
  neynarScoreReason,
}: WeeklyJackpotPageProps) {
  const {
    wallet,
    weekly,
    playerWeekly,
    claimableToppings,
    handleClaimToppings,
    isEntryInProgress,
  } = useGamePageData()
  const isNeynarBlocked = !neynarScoreLoading && !neynarScoreAllowed
  const [isMobile, setIsMobile] = useState(false)
  const [showToppingBreakdown, setShowToppingBreakdown] = useState(false)
  const [showShareAfterClaim, setShowShareAfterClaim] = useState(false)
  const [claimedToppingCount, setClaimedToppingCount] = useState(0)
  const [tierBonus, setTierBonus] = useState(0)
  const [shareToppings, setShareToppings] = useState(0)

  // Fetch share toppings from ShareAndSpin contract
  const fetchShareToppings = useCallback(async () => {
    if (!wallet?.address) { setShareToppings(0); return }
    try {
      const result = await readContract(wagmiConfig, {
        address: SHARE_AND_SPIN_ADDRESS as `0x${string}`,
        abi: SHARE_AND_SPIN_ABI,
        functionName: 'getShareInfo',
        args: [wallet.address as `0x${string}`],
      }) as [bigint, boolean, bigint]
      setShareToppings(Number(result[0]))
    } catch { setShareToppings(0) }
  }, [wallet?.address])

  useEffect(() => { fetchShareToppings() }, [fetchShareToppings])

  // Fetch tier bonus from staking contract
  const fetchTierBonus = useCallback(async () => {
    if (!wallet?.address) {
      setTierBonus(0)
      return
    }
    try {
      const bonus = await readContract(wagmiConfig, {
        address: PIZZA_STAKING_ADDRESS as `0x${string}`,
        abi: PIZZA_STAKING_ABI,
        functionName: 'getToppingBonus',
        args: [wallet.address as `0x${string}`],
      }) as bigint
      setTierBonus(Number(bonus))
    } catch (err) {
      console.error('Failed to fetch tier bonus:', err)
      setTierBonus(0)
    }
  }, [wallet?.address])

  useEffect(() => {
    void fetchTierBonus()
  }, [fetchTierBonus])

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
  // Use fixed USD values so the jackpot display doesn't drift with PIZZA price swings.
  // Treasury bonus is always $20. Each topping is always $0.10.
  const jackpotUsdValue = 20 + (weekly.estimatedToppings * 0.10)
  const jackpotDisplay = jackpotUsdValue.toFixed(2)
  const hasPaidEntry = playerWeekly?.hasPaidEntry ?? false
  const claimButtonDisabled =
    !wallet?.isAuthenticated ||
    !claimWindowOpen ||
    hasClaimed ||
    claimableNumber <= 0 ||
    !hasPaidEntry ||
    isEntryInProgress ||
    neynarScoreLoading ||
    isNeynarBlocked

  const claimButtonLabel = neynarScoreLoading
    ? 'Checking account…'
    : isNeynarBlocked
      ? '🔒 Neynar score too low'
      : wallet?.isAuthenticated && !hasPaidEntry && claimableNumber > 0
        ? 'Play once ($1) to claim toppings'
        : wallet?.isAuthenticated
          ? `🍕 Claim ${claimableNumber} Toppings 🍕`
          : 'Connect wallet to claim'

  // Calculate topping breakdown
  const dailyPlays = Number(playerWeekly?.dailyPlays ?? 0n)
  const dailyPlayToppings = dailyPlays + (dailyPlays === 7 ? 3 : 0) // 1 per play + 3 streak bonus
  const holdingsToppings = Number(playerWeekly?.projectedHoldingsBonus ?? 0n)
  // tierBonus: 0 (Slice Runner), +1 (Oven Operator), +3 (Pie Boss), +5 (Pizza Tycoon)
  const totalToppingsBeforeClaim = dailyPlayToppings + shareToppings + holdingsToppings + tierBonus

  const handleOpenToppingBreakdown = () => {
    if (isNeynarBlocked) {
      alert(neynarScoreReason || 'Your Neynar score is too low to play. You need 0.22 (22) or higher.')
      return
    }
    if (!hasPaidEntry && claimableNumber > 0) {
      alert('You need at least one paid daily entry ($1 of PIZZA) this week before you can claim toppings. Share & Spin and free slices do not count.')
      return
    }
    if (!claimButtonDisabled) {
      setShowToppingBreakdown(true)
    }
  }

  const handleClaimFromModal = async () => {
    const count = totalToppingsBeforeClaim
    setShowToppingBreakdown(false)
    const success = await handleClaimToppings(userFid)
    if (success) {
      setClaimedToppingCount(count)
      setShowShareAfterClaim(true)
    }
  }

  const handleShareCast = useCallback(() => {
    const dollarValue = (claimedToppingCount * 0.10).toFixed(2)
    const shareText = `🍕 Just claimed ${claimedToppingCount} toppings in Pizza Party — that's $${dollarValue} added to the weekly jackpot!\n\nEach topping is a ticket to win. More toppings = better odds at the weekly draw.\n\nGrab your slice:`
    const embedUrl = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

    sdk.actions.composeCast({
      text: shareText,
      embeds: [embedUrl],
    }).catch(err => console.error('[Weekly] composeCast failed:', err))

    setShowShareAfterClaim(false)
  }, [claimedToppingCount])

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
            <p className="text-white font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '28px', lineHeight: '1', marginBottom: '4px', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}>
              Weekly Jackpot
            </p>
            <p className="text-white text-4xl font-black" style={{ fontFamily: 'var(--font-luckiest-guy)', lineHeight: '1', margin: '0', padding: '0', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}>
              ${jackpotDisplay}
            </p>
            <p className="text-white text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)', marginTop: '0px', marginBottom: '0px', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}>
              Weekly Players {weeklyPlayersDisplay}
            </p>
            <p className="text-white text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)', marginTop: '0px', marginBottom: '0px', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)', opacity: 0.8 }}>
              Weekly Game #{weekly.weeklyGameId}
            </p>
            <div className="flex justify-center items-center gap-3" style={{ marginTop: '0px' }}>
              <span className="text-white" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '14px', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}>Daily Entry Streak:</span>
              <div className="flex gap-0.5">
                {[...Array(7)].map((_, i) => (
                  <span key={i} style={{ opacity: i < dailyPlays ? 1 : 0.3, fontSize: '14px' }}>🍕</span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border-4 border-blue-200 rounded-2xl px-3 py-2 text-center" style={{ borderColor: '#000000' }}>
            <div className="flex justify-center items-center mb-1">
              <span className="text-blue-700 text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '22px', textShadow: '2px 2px 0px #FFA500, 3px 3px 0px rgba(255, 165, 0, 0.5)' }}>
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
                  <p className="text-blue-800 text-xl font-bold">
                    {item.value}
                  </p>
                  <p className="text-blue-500 text-xs font-semibold">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="text-orange-500 text-xs mt-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              Claim Window Opens every Sunday at 12pm PST
            </p>
            <p className="text-blue-600 text-xs mt-0.5" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              Draw happens every Monday at 12pm PST
            </p>
          </div>

          <Button
            className="w-full !bg-red-600 hover:!bg-red-700 text-white font-bold py-2.5 rounded-xl border-4 border-red-800 disabled:opacity-50 disabled:pointer-events-none"
            style={customFontStyle}
            disabled={claimButtonDisabled || isBanned}
            onClick={handleOpenToppingBreakdown}
          >
            {claimWindowOpen ? claimButtonLabel : 'CLAIM WINDOW CLOSED'}
          </Button>
          {isNeynarBlocked && (
            <p className="text-center text-[11px] text-red-800 leading-snug -mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              Need a Neynar score of 0.22 (22) or higher to claim toppings.
            </p>
          )}

          <Button
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: 20 }}
            disabled={isBanned}
            onClick={onNavigateToDaily}
          >
            🍕 GRAB A SLICE 🍕
          </Button>

          <Button
            className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: 20 }}
            disabled={isBanned}
            onClick={() => {
              if (onNavigateToLeaderboard) {
                onNavigateToLeaderboard()
                return
              }
              alert('Leaderboard coming soon!')
            }}
          >
            <span className="flex items-center justify-center w-full gap-2">
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
              <span className="text-center">LEADERBOARD</span>
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </span>
          </Button>

          {/* Own a Parlor Button */}
          <Button
            onClick={onNavigateToParlor}
            disabled={isBanned}
            className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 rounded-xl border-4 border-orange-800 uppercase cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: 20 }}
          >
            🍍 OWN A PARLOR 🍍
          </Button>

          {/* Staking Button */}
          <Button
            onClick={onNavigateToStaking}
            disabled={isBanned}
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-900 uppercase cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: 20 }}
          >
            <span className="flex items-center justify-center w-full gap-2">
              <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
              <span className="text-center">Spin & Stake</span>
              <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
            </span>
          </Button>

          {/* Stickers & Chat */}
          <div className="flex w-full gap-2">
            <Button
              onClick={() => window.location.href = '/sticker'}
              className="flex-1 !bg-red-600 hover:!bg-red-700 text-white py-3 px-2 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 14 : 16, fontWeight: '900' }}
            >
              <span className="flex items-center justify-center w-full gap-1">
                <img src="/images/pizza_party_BW_qr.png" alt="" className="inline-block" style={{ height: '0.9em', width: '0.9em' }} />
                <span className="text-center">PIZZA STICKERS</span>
                <img src="/images/pizza_party_BW_qr.png" alt="" className="inline-block" style={{ height: '0.9em', width: '0.9em' }} />
              </span>
            </Button>
            <Button
              onClick={() => window.location.href = '/chat'}
              disabled={!hasEarlyAccess(null, wallet?.address)}
              className="flex-1 !bg-red-600 hover:!bg-red-700 text-white py-3 px-2 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 14 : 16, fontWeight: '900' }}
            >
              🍕 PIZZA CHAT 🍕
            </Button>
          </div>

          <Card className="border-4 border-red-500 rounded-2xl bg-white/95 !py-0">
            <div className="px-3 py-2">
              <p className="text-red-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', lineHeight: '1', textShadow: '2px 2px 0px #FFA500, 3px 3px 0px rgba(255, 165, 0, 0.5)' }}>
                How to Earn Toppings
              </p>
              <ul className="space-y-0.5 text-red-700 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {HOW_TO_WIN.map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span>🍅</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className="text-red-600 text-center mb-0.5 mt-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '20px' }}>
                Weekly Jackpot
              </p>
              <ul className="space-y-0.5 text-red-700 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {TERMS.weeklyJackpot.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
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

      {/* Topping Breakdown Modal */}
      <ToppingBreakdownModal
        isOpen={showToppingBreakdown}
        onClose={() => setShowToppingBreakdown(false)}
        dailyPlays={dailyPlays}
        dailyPlayToppings={dailyPlayToppings}
        shareToppings={shareToppings}
        holdingsToppings={holdingsToppings}
        tierBonus={tierBonus}
        totalToppings={totalToppingsBeforeClaim}
        isLoading={isEntryInProgress}
        onClaim={handleClaimFromModal}
        isMobile={isMobile}
      />

      {/* Share After Claim Modal */}
      {showShareAfterClaim && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={(e) => { if (e.target === e.currentTarget) setShowShareAfterClaim(false) }}
        >
          <div
            className="relative rounded-3xl border-4 border-black shadow-2xl overflow-hidden cursor-default"
            style={{ maxWidth: isMobile ? '100%' : '380px', width: '100%' }}
          >
            {/* Pizza pattern background */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "url('/images/pizza-pattern-background.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />

            {/* Content overlay */}
            <div className="relative z-10 flex flex-col items-center text-center px-5 py-6">
              {/* Close button */}
              <button
                onClick={() => setShowShareAfterClaim(false)}
                className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
              >
                <X size={20} />
              </button>

              {/* Dark panel for readability */}
              <div className="bg-black/70 rounded-2xl px-5 py-5 w-full">
                <p
                  className="text-white text-2xl mb-1"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    textShadow: '2px 2px 0px #8B0000',
                  }}
                >
                  TOPPINGS CLAIMED!
                </p>

                <p
                  className="text-yellow-400 mb-1"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    fontSize: isMobile ? '48px' : '56px',
                    lineHeight: '1',
                    textShadow: '2px 2px 0px #8B0000',
                  }}
                >
                  {claimedToppingCount}
                </p>
                <p
                  className="text-yellow-300 text-sm mb-3"
                  style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                >
                  TOPPINGS
                </p>

                <p
                  className="text-white text-lg mb-1"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    textShadow: '1px 1px 0px #000',
                  }}
                >
                  ${(claimedToppingCount * 0.10).toFixed(2)} ADDED TO JACKPOT
                </p>

                <p
                  className="text-yellow-200 text-xs mb-4"
                  style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                >
                  Each topping = a ticket to win!
                </p>

                {/* Share button */}
                <button
                  onClick={handleShareCast}
                  className="bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all rounded-full border-4 border-black shadow-xl px-8 py-2 w-full max-w-[240px]"
                >
                  <p
                    className="text-white whitespace-nowrap"
                    style={{
                      fontFamily: 'var(--font-luckiest-guy)',
                      textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                      fontSize: isMobile ? '1.1rem' : '1.3rem',
                      lineHeight: '1',
                      margin: '0',
                    }}
                  >
                    SHARE
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
