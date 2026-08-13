'use client'

import { Suspense, useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { useGamePageData } from '../../lib/useGamePageData'
import { sdk } from '@farcaster/miniapp-sdk'
import { PIZZA_TOKEN_ADDRESS } from '../../lib/constants'
import ShareAndSpinModal from './ShareAndSpinModal'
import { hasEarlyAccess } from '../../lib/constants/earlyAccess'

const SHOW_PLAYER_STATS = false


interface GamePageProps {
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToParlor?: () => void
  onNavigateToStaking?: () => void
  isBanned?: boolean
  userFid?: number | null
  /** Neynar score gate — required for enter / Share & Spin */
  neynarScoreAllowed?: boolean
  neynarScoreLoading?: boolean
  neynarScoreReason?: string | null
}

export default function GamePage({ onNavigateToWeekly, onNavigateToLeaderboard, onNavigateToParlor, onNavigateToStaking, isBanned, userFid, neynarScoreAllowed, neynarScoreLoading, neynarScoreReason }: GamePageProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GamePageContent
        onNavigateToWeekly={onNavigateToWeekly}
        onNavigateToLeaderboard={onNavigateToLeaderboard}
        onNavigateToParlor={onNavigateToParlor}
        onNavigateToStaking={onNavigateToStaking}
        isBanned={isBanned}
        userFid={userFid}
        neynarScoreAllowed={neynarScoreAllowed}
        neynarScoreLoading={neynarScoreLoading}
        neynarScoreReason={neynarScoreReason}
      />
    </Suspense>
  )
}

function GamePageContent({ onNavigateToWeekly, onNavigateToLeaderboard, onNavigateToParlor, onNavigateToStaking, isBanned, userFid, neynarScoreAllowed = false, neynarScoreLoading = true, neynarScoreReason }: GamePageProps) {
  const isNeynarBlocked = !neynarScoreLoading && !neynarScoreAllowed
  const [isMobile, setIsMobile] = useState(false)
  const [isFarcasterMiniApp, setIsFarcasterMiniApp] = useState(false)
  const [isBaseInApp, setIsBaseInApp] = useState(false)
  const [showShareAndSpin, setShowShareAndSpin] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let mounted = true
    const ua = navigator.userAgent || ''
    const isMobileUA = /Android|iPhone|iPad|iPod/i.test(ua)
    const baseRegex = /(BaseWallet|Base Wallet|BaseApp|Base App|CoinbaseWallet)/i

    const detectFarcaster = async () => {
      try {
        const inMiniApp = typeof sdk.isInMiniApp === 'function' ? await sdk.isInMiniApp() : false
        if (mounted && inMiniApp) setIsFarcasterMiniApp(true)
      } catch (err) {
        console.debug('Miniapp detection failed', err)
      }
    }

    if (isMobileUA && baseRegex.test(ua)) {
      setIsBaseInApp(true)
    }

    detectFarcaster()
    return () => {
      mounted = false
    }
  }, [])

  const {
    wallet,
    pizzaUsd,
    daily,
    playerInfo,
    playerWeekly,
    pacificCountdown,
    openWalletModal,
    handleEnterGame,
    isEntryInProgress,
    hasEnteredToday,
    hasEnoughPizza,
    // Free slice (pending slice from parlor owner)
    hasPendingSlice,
    pendingSliceSponsorName,
    handleClaimFreeSlice,
    isClaimingSlice,
  } = useGamePageData()

  const customFontStyle = {
    fontFamily: 'var(--font-luckiest-guy)',
    fontWeight: 'bold' as const,
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  }

  // Determine main action button state
  // Note: No approval step needed - we use EIP-2612 permit for single-transaction entry!
  const buttonConfig = useMemo(() => {
    if (isBanned) {
      return { text: '🚫 ACCOUNT RESTRICTED', onClick: () => {}, disabled: true }
    }
    if (neynarScoreLoading) {
      return { text: 'CHECKING ACCOUNT…', onClick: () => {}, disabled: true }
    }
    if (isNeynarBlocked) {
      return {
        text: '🔒 NEYNAR SCORE TOO LOW',
        onClick: () => {
          alert(neynarScoreReason || 'Your Neynar score is too low to play. You need 0.22 (22) or higher.')
        },
        disabled: false,
      }
    }
    if (!wallet?.isAuthenticated) {
      return { text: '🍕 CONNECT WALLET 🍕', onClick: openWalletModal, disabled: false }
    }
    if (hasEnteredToday) {
      return { text: '✅ ALREADY ENTERED TODAY', onClick: () => {}, disabled: true }
    }
    // PRIORITY: Show free slice button if user has a pending slice from a parlor owner
    if (hasPendingSlice) {
      const sponsorText = pendingSliceSponsorName ? ` from ${pendingSliceSponsorName}` : ''
      return {
        text: `🎁 CLAIM FREE SLICE${sponsorText} 🎁`,
        onClick: handleClaimFreeSlice,
        disabled: isClaimingSlice
      }
    }
    if (!hasEnoughPizza) {
      return { text: 'NEED $1 PIZZA TO PLAY', onClick: () => {
        if (isFarcasterMiniApp) {
          sdk.actions.viewToken({ token: `eip155:8453/erc20:${PIZZA_TOKEN_ADDRESS}` })
        } else {
          window.open(`https://base.app/coin/base-mainnet/${PIZZA_TOKEN_ADDRESS}`, '_blank')
        }
      }, disabled: false }
    }
    // Single transaction entry with permit - no separate approval needed!
    return {
      text: '🍕 ENTER GAME 🍕',
      onClick: () => {
        // If first entry, show referral input modal
        handleEnterGame('', userFid)
      },
      disabled: isEntryInProgress
    }
  }, [isBanned, neynarScoreLoading, isNeynarBlocked, neynarScoreReason, wallet, hasEnteredToday, hasEnoughPizza, openWalletModal, handleEnterGame, isEntryInProgress, hasPendingSlice, pendingSliceSponsorName, handleClaimFreeSlice, isClaimingSlice, userFid])

  const { hours, minutes, seconds } = pacificCountdown

  const shouldShowManageWallet = wallet?.isAuthenticated && wallet?.address && !(isFarcasterMiniApp || isBaseInApp)

  return (
    <main
      className="min-h-screen p-4 flex justify-center items-start"
      style={{
        backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
      }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-4">

        {/* Header */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border-4 border-black relative overflow-hidden w-full" style={{ marginBottom: '8px' }}>
          <div className="relative w-full" style={{ paddingBottom: '35%', minHeight: '140px' }}>
            <Image
              src="/images/DailyCard.png"
              alt="EVERY 24 HOURS! 8 SLICES, 8 WINNERS!"
              fill
              className="object-cover"
              priority
              sizes="100vw"
              style={{ objectPosition: 'center 42%' }}
            />
          </div>
        </div>

        {/* Daily Jackpot */}
        <div className="bg-blue-100/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border-4 border-black w-full text-center">
          <p className="text-blue-600 font-bold text-center" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '28px', lineHeight: '1', marginBottom: '0', textShadow: '2px 2px 0px #FFA500, 3px 3px 0px rgba(255, 165, 0, 0.5)' }}>Daily Jackpot</p>
          <p className="text-blue-800 text-3xl font-bold text-center" style={{ fontFamily: 'var(--font-luckiest-guy)', lineHeight: '1', margin: '0', padding: '0' }}>
            {daily.loading ? 'Loading...' : `$${(Number(daily.jackpot) * pizzaUsd).toFixed(2)}`}
          </p>

          {/* Next Draw Countdown */}
          <p className="text-blue-600 font-bold leading-none" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '14px' }}>Next Draw:</p>
          <div className="flex items-center justify-center gap-1">
            <div className="bg-white px-2 py-0.5 rounded border border-black text-center">
              <div className="text-blue-800 font-bold text-sm leading-none">{hours}</div>
              <div className="text-blue-600 text-[8px] leading-none">HRS</div>
            </div>
            <span className="text-blue-800 font-bold">:</span>
            <div className="bg-white px-2 py-0.5 rounded border border-black text-center">
              <div className="text-blue-800 font-bold text-sm leading-none">{minutes}</div>
              <div className="text-blue-600 text-[8px] leading-none">MIN</div>
            </div>
            <span className="text-blue-800 font-bold">:</span>
            <div className="bg-white px-2 py-0.5 rounded border border-black text-center">
              <div className="text-blue-800 font-bold text-sm leading-none">{seconds}</div>
              <div className="text-blue-600 text-[8px] leading-none">SEC</div>
            </div>
          </div>

          <p className="text-blue-600 text-sm text-center leading-none mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
            {daily.loading
              ? 'Loading entries...'
              : `Total entries: ${daily.totalEntries} • Game #${daily.dailyGameId}`}
          </p>
          <p className="text-blue-600 text-xs text-center leading-none" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
            Every entry donates 3% to Veteran charities
          </p>

          {daily.isCompleted && !daily.loading && (
            <p className="text-xs text-blue-700 mt-1">This game has been finalized.</p>
          )}
          {daily.error && (
            <p className="text-xs text-red-600 mt-1">Error loading daily data</p>
          )}
        </div>

        {/* Player Stats */}
        {SHOW_PLAYER_STATS && wallet?.isAuthenticated && playerInfo && (
          <div className="bg-yellow-100/90 backdrop-blur-sm p-2 rounded-xl border-2 border-yellow-300 mt-2 w-full">
            <p className="text-yellow-800 text-sm font-bold" style={customFontStyle}>
              🍕 Your Stats: {Number(playerInfo.totalToppings)} Toppings
            </p>
            <p className="text-yellow-800 text-sm font-bold text-center" style={customFontStyle}>
              {Number(playerInfo.dailyEntries)} Entries
            </p>
          </div>
        )}

        {/* Pizza Image */}
        <div className="w-72 h-72 relative">
          <Image
            src="/images/pizza-final.png"
            alt="Pizza"
            fill
            className="object-contain drop-shadow-2xl"
            priority
          />
          <svg
            viewBox="0 0 240 240"
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          >
            {[...Array(8)].map((_, i) => {
              const angle = i * 45 - 90
              const center = 120
              const radius = 105
              const endX = center + radius * Math.cos((angle * Math.PI) / 180)
              const endY = center + radius * Math.sin((angle * Math.PI) / 180)
              return (
                <line
                  key={i}
                  x1={center}
                  y1={center}
                  x2={endX}
                  y2={endY}
                  stroke="#8B4513"
                  strokeWidth={3}
                  opacity={0.7}
                />
              )
            })}
          </svg>
        </div>

        {/* All Main Buttons with Consistent 12px Spacing */}
        <div className="w-full flex flex-col gap-3">
          {/* Wallet Status */}
          {wallet?.isAuthenticated && wallet?.address ? (
            <div className="bg-green-100 border-4 border-green-800 rounded-xl py-2 text-center text-green-800 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              ✅ Connected {wallet.address.slice(0,6)}...{wallet.address.slice(-4)}
            </div>
          ) : (
            <div className="w-full bg-yellow-100 border-4 border-yellow-800 rounded-xl py-1 text-center text-yellow-800 font-bold">
              ❌ Wallet not connected
            </div>
          )}

          {/* Main Action Button */}
          <Button
            className={`!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 w-full ${
              buttonConfig.disabled
                ? buttonConfig.text === '✅ ALREADY ENTERED TODAY'
                  ? 'cursor-not-allowed'
                  : 'opacity-50 cursor-not-allowed'
                : ''
            }`}
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            onClick={buttonConfig.onClick}
            disabled={buttonConfig.disabled}
          >
            {isEntryInProgress ? 'Processing...' : buttonConfig.text}
          </Button>

          {/* Share & Spin */}
          <div className="bg-white/95 backdrop-blur-md rounded-xl border-2 border-red-300 p-3 w-full text-center" style={{ borderColor: '#000000' }}>
            <p className="text-red-600 text-center mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', lineHeight: '1', textShadow: '2px 2px 0px #FFA500, 3px 3px 0px rgba(255, 165, 0, 0.5)' }}>
              Share & Earn FREE $PIZZA
            </p>
            <p className="text-xs text-red-700" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              Share once a day · max 3/week
            </p>
            <p className="text-xs text-red-700" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              $0.01 PIZZA + 1 topping + spin for free Pizza
            </p>
            <Button
              onClick={() => {
                if (isNeynarBlocked) {
                  alert(neynarScoreReason || 'Your Neynar score is too low to play. You need 0.22 (22) or higher.')
                  return
                }
                setShowShareAndSpin(true)
              }}
              disabled={isBanned || !userFid || neynarScoreLoading || isNeynarBlocked}
              className="mt-2 w-full !bg-red-500 hover:!bg-red-600 text-white font-bold py-2 rounded-xl border-2 border-red-700 disabled:opacity-50"
              style={customFontStyle}
            >
              {neynarScoreLoading ? 'CHECKING…' : isNeynarBlocked ? '🔒 SCORE TOO LOW' : 'SHARE & SPIN'}
            </Button>
            {isNeynarBlocked && (
              <p className="mt-2 text-[11px] text-red-800 leading-snug" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                Need a Neynar score of 0.22 (22) or higher to enter, share & spin, or claim toppings.
              </p>
            )}
          </div>

          {/* Weekly Jackpot Button */}
          <Button
            className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl border-4 border-yellow-800 w-full uppercase disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            disabled={isBanned}
            onClick={() => {
              if (onNavigateToWeekly) {
                onNavigateToWeekly()
                return
              }
              alert('Weekly Jackpot coming soon!')
            }}
          >
            <span className="flex items-center justify-center w-full gap-2">
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
              <span className="text-center">Claim Toppings</span>
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
            </span>
          </Button>

          {/* Leaderboard Button */}
          <Button
            className="!bg-red-700 hover:!bg-red-800 text-white font-bold py-2 rounded-xl border-4 border-red-900 w-full uppercase disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
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
              <span className="text-center">Leaderboard</span>
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </span>
          </Button>

          {/* Own a Parlor Button */}
          <Button
            onClick={onNavigateToParlor}
            disabled={isBanned}
            className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2 rounded-xl border-4 border-orange-800 uppercase cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
          >
            🍍 OWN A PARLOR 🍍
          </Button>

          {/* Staking Button */}
          <Button
            onClick={onNavigateToStaking}
            disabled={isBanned}
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-900 uppercase cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
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

          {/* Manage Wallet Button (when connected) */}
          {shouldShowManageWallet && (
            <Button
              className="!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 w-full uppercase disabled:opacity-50 disabled:pointer-events-none"
              disabled={isBanned}
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              onClick={() => openWalletModal()}
            >
              <span className="flex items-center justify-center w-full gap-2">
                <Image src="/images/wallet-icon.png" alt="Wallet" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
                <span className="text-center">Manage Wallet</span>
                <Image src="/images/wallet-icon.png" alt="Wallet" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
              </span>
            </Button>
          )}
        </div>

        {/* Daily Entry Explained Card */}
        <Card className="border-4 border-yellow-600 rounded-2xl bg-white/95 mt-3 !py-0">
          <div className="px-3 py-2">
            <p className="text-red-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', lineHeight: '1', textShadow: '2px 2px 0px #FFA500, 3px 3px 0px rgba(255, 165, 0, 0.5)' }}>
              Daily Entry Explained
            </p>
            <ul className="space-y-0.5 text-red-700 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>Entry to play is $1 of $Pizza</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>One entry per day (resets 12pm PST)</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>Equal odds for all players regardless of holdings</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>8 winners randomly selected daily at 12pm PST</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>Daily jackpot split equally among winners; prizes auto-paid</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>One Entry a week is required to Claim Toppings</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>Daily pot breakdown: 80% Public, 10% Stakers, 7% Parlor Owners, 3% Veteran Charities (USA & Ukraine)</span>
              </li>
            </ul>
          </div>
        </Card>

      </div>

      {showShareAndSpin && (
        <ShareAndSpinModal
          userFid={userFid}
          pizzaUsdPrice={pizzaUsd}
          onClose={() => setShowShareAndSpin(false)}
          onGoToDaily={() => setShowShareAndSpin(false)}
          isBanned={isBanned}
          hasEnteredToday={hasEnteredToday}
          weeklyPlays={Number(playerWeekly?.dailyPlays ?? 0)}
        />
      )}
    </main>
  )
}
