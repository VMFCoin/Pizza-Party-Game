'use client'

import { Suspense, useState, useMemo, useEffect, useCallback, ReactNode } from 'react'
import Image from 'next/image'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Users, Share2, X } from 'lucide-react'
import { useGamePageData } from '../../lib/useGamePageData'
import { sdk } from '@farcaster/miniapp-sdk'
import { PIZZA_TOKEN_ADDRESS } from '../../lib/constants'

const SHARE_BASE_URL = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

const SOCIAL_ICONS = {
  warpcast: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#9333EA" />
      <path
        d="M7 7h2.6l2.4 6.2L14.4 7H17l-3.1 10H10z"
        fill="#fff"
      />
    </svg>
  ),
  twitter: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="12" fill="#000" />
      <path
        d="M7 6h2.3l3.2 4.6L15.5 6H18l-4.2 6L18 18h-2.3l-3.2-4.8L9.3 18H7l4.4-6z"
        fill="#fff"
      />
    </svg>
  ),
  telegram: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        d="M16.8 8.2l-9.6 3.7c-.6.2-.6 1 0 1.2l2.3.8 1 3.1c.1.4.6.5.9.2l1.5-1.6 2.5 1.8c.4.3 1 .1 1.1-.4l1.7-8.1c.1-.5-.4-.9-.9-.7z"
        fill="#fff"
      />
    </svg>
  ),
  whatsapp: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        d="M8.7 6.5a4.8 4.8 0 014.8 4.8c0 2.6-2.1 4.8-4.8 4.8-.7 0-1.4-.1-2-.4l-1.4.5.5-1.4a4.8 4.8 0 01-1-2.9 4.8 4.8 0 014.9-4.4zm0-1.5a6.3 6.3 0 00-5.4 9.4L2.5 21l6-1.7a6.3 6.3 0 102.2-12.3z"
        fill="#fff"
      />
      <path
        d="M9.4 8.7c-.1-.2-.3-.2-.5-.2h-.4c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.5 1 2.6c.1.2 1.7 2.6 4.2 3.6.6.2 1 .3 1.4.3.6 0 1.1-.3 1.3-.7.1-.4.1-.7.1-.8 0-.2-.1-.3-.3-.3h-.6c-.2 0-.4 0-.6.2l-.3.2c-.2.2-.4.1-.6 0s-1-.4-1.9-1.3c-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.3.1-.4l.3-.4c.1-.1.2-.3.3-.4.1-.2 0-.3 0-.4 0-.1-.3-1-.5-1.4z"
        fill="#25D366"
      />
    </svg>
  ),
  facebook: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        d="M13 8.5V7.2c0-.4.3-.7.7-.7h1.2V4.3h-1.9C11.3 4.3 10 5.6 10 7.3v1.2H8v2.2h2v5.9h2.5v-5.9h1.7l.3-2.2H12.5z"
        fill="#fff"
      />
    </svg>
  ),
  copy: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="12" height="12" rx="2" fill="#F3F4F6" stroke="#1F2937" strokeWidth="1.5" />
      <rect x="5" y="5" width="12" height="12" rx="2" fill="#fff" stroke="#1F2937" strokeWidth="1.5" />
    </svg>
  ),
}

const SHOW_PLAYER_STATS = false

const SHARE_PLATFORMS: SharePlatform[] = [
  {
    name: 'Farcaster',
    icon: (
      <Image
        src="/images/Farcaster logo icon.png"
        alt="Farcaster"
        width={20}
        height={20}
        className="rounded-sm bg-white"
      />
    ),
    color: '!bg-[#6C47FF] hover:!bg-[#5D3FE5]',
    shareUrl: (url: string, text: string) =>
      `https://warpcast.com/~/compose?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    name: 'X (Twitter)',
    icon: SOCIAL_ICONS.twitter,
    color: '!bg-black hover:!bg-gray-900',
    shareUrl: (url: string, text: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Telegram',
    icon: SOCIAL_ICONS.telegram,
    color: '!bg-sky-500 hover:!bg-sky-600',
    shareUrl: (url: string, text: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    name: 'WhatsApp',
    icon: SOCIAL_ICONS.whatsapp,
    color: '!bg-green-500 hover:!bg-green-600',
    shareUrl: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    name: 'Facebook',
    icon: SOCIAL_ICONS.facebook,
    color: '!bg-blue-600 hover:!bg-blue-700',
    shareUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: 'Copy Link',
    icon: SOCIAL_ICONS.copy,
    color: '!bg-gray-600 hover:!bg-gray-700',
    action: 'copy',
  },
] as const

type SharePlatform = {
  name: string
  icon: ReactNode
  color: string
  shareUrl?: (url: string, text: string) => string
  action?: 'copy'
}


interface GamePageProps {
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToParlor?: () => void
  onNavigateToStaking?: () => void
}

export default function GamePage({ onNavigateToWeekly, onNavigateToLeaderboard, onNavigateToParlor, onNavigateToStaking }: GamePageProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GamePageContent onNavigateToWeekly={onNavigateToWeekly} onNavigateToLeaderboard={onNavigateToLeaderboard} onNavigateToParlor={onNavigateToParlor} onNavigateToStaking={onNavigateToStaking} />
    </Suspense>
  )
}

function GamePageContent({ onNavigateToWeekly, onNavigateToLeaderboard, onNavigateToParlor, onNavigateToStaking }: GamePageProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [referralCodeInput, setReferralCodeInput] = useState('')
  const [showReferralInput, setShowReferralInput] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [isFarcasterMiniApp, setIsFarcasterMiniApp] = useState(false)
  const [isBaseInApp, setIsBaseInApp] = useState(false)

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
    referralInfo,
    pacificCountdown,
    openWalletModal,
    handleEnterGame,
    isEntryInProgress,
    hasEnteredToday,
    hasEnoughPizza,
    hasUsedReferral,
    isFirstTimePlayer,
    // Free slice (pending slice from parlor owner)
    hasPendingSlice,
    pendingSliceSponsorName,
    handleClaimFreeSlice,
    isClaimingSlice,
  } = useGamePageData()

  useEffect(() => {
    if (!shareCopied) return
    const id = setTimeout(() => setShareCopied(false), 2000)
    return () => clearTimeout(id)
  }, [shareCopied])

  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: 'bold' as const,
  }

  // Debug render
  console.debug('GamePageContent render — hasEnteredToday:', hasEnteredToday, 'isFirstTimePlayer:', isFirstTimePlayer, 'hasUsedReferral:', hasUsedReferral)

  // Check if player can use a referral code (only on their FIRST EVER game entry)
  // isFirstTimePlayer = true means lifetimeToppings = 0 (they've never played before)
  // hasUsedReferral tracks if they've submitted a referral code already (they can only do this once)
  // The modal should ONLY show for first-time players who haven't used a referral yet
  const canUseReferral = isFirstTimePlayer && !hasUsedReferral

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (!refCode) return
    setReferralCodeInput(refCode.toUpperCase())
    if (canUseReferral) {
      setShowReferralInput(true)
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, [canUseReferral])

  // Hide referral input modal when entry is successful
  useEffect(() => {
    if (hasEnteredToday) {
      setShowReferralInput(false)
    }
  }, [hasEnteredToday])

  // Determine main action button state
  // Note: No approval step needed - we use EIP-2612 permit for single-transaction entry!
  const buttonConfig = useMemo(() => {
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
      return { text: 'NEED $1 PIZZA TO PLAY', onClick: () => sdk.actions.viewToken({ token: `eip155:8453/erc20:${PIZZA_TOKEN_ADDRESS}` }), disabled: false }
    }
    // Single transaction entry with permit - no separate approval needed!
    return {
      text: '🍕 ENTER GAME 🍕',
      onClick: () => {
        // If first entry, show referral input modal
        if (canUseReferral) {
          setShowReferralInput(true)
        } else {
          // Not first entry - enter without referral code (pass empty string)
          handleEnterGame('')
        }
      },
      disabled: isEntryInProgress
    }
  }, [wallet, hasEnteredToday, hasEnoughPizza, openWalletModal, handleEnterGame, isEntryInProgress, canUseReferral, hasPendingSlice, pendingSliceSponsorName, handleClaimFreeSlice, isClaimingSlice])

  const { hours, minutes, seconds } = pacificCountdown

  // Handle referral code submission
  const handleEnterWithReferral = async () => {
    console.log('=== handleEnterWithReferral CALLED ===')
    const code = referralCodeInput.trim()
    console.log('Referral code input:', code || '(empty)')
    // Don't hide modal until transaction is initiated
    // The handleEnterGame function will set hasEnteredToday=true on success
    // which will hide this modal via the conditional render
    try {
      console.log('Calling handleEnterGame...')
      await handleEnterGame(code.length > 0 ? code : '')
      console.log('handleEnterGame completed')
    } catch (err) {
      console.error('Entry failed:', err)
      alert(`Entry failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    // Only clear the input after attempting entry
    setReferralCodeInput('')
  }

  const referralCode = referralInfo?.referralCode ?? ''
  const referralShareUrl = referralCode ? `${SHARE_BASE_URL}${referralCode}` : ''
  const shareText = referralCode
    ? `🔥🍕 No leftovers. No stale odds. Just fresh pie every day.\nJoin Pizza Party to chase daily and weekly jackpots paid in $PIZZA.\n\nEarn toppings, boost the jackpot, and use my referral ${referralCode} to get in the oven.\nPlay together. Win together. Eat together.\n\nCome grab your slice 🍕🔥`
    : '🔥🍕 No leftovers. No stale odds. Just fresh pie every day.\nJoin Pizza Party to chase daily and weekly jackpots paid in $PIZZA.\n\nEarn toppings, boost the jackpot, and get in the oven.\nPlay together. Win together. Eat together.\n\nCome grab your slice 🍕🔥'

  const tryFarcasterShare = useCallback(async (url: string, text: string) => {
    const actions = sdk.actions as {
      composeCast?: (opts?: { text?: string; embeds?: string[] }) => Promise<void>
    }
    if (typeof actions.composeCast !== 'function') return false
    try {
      await actions.composeCast({
        text,
        embeds: [url],
      })
      return true
      } catch (err) {
      console.warn('Farcaster share failed, falling back', err)
      return false
    }
  }, [])

  const handleShareOption = async (platform: SharePlatform) => {
    if (!referralShareUrl) return
    const combinedMessage = `${shareText}\n${referralShareUrl}`
    try {
      if (platform.name === 'Farcaster') {
        const handled = await tryFarcasterShare(referralShareUrl, shareText)
        if (handled) {
          setShowShareModal(false)
          return
        }
      }
      if (platform.action === 'copy') {
        await navigator.clipboard.writeText(combinedMessage)
        setShareCopied(true)
        return
      }
      if (platform.shareUrl) {
        const url = platform.shareUrl(referralShareUrl, shareText)
        window.open(url, '_blank', 'width=600,height=500')
      }
    } catch (err) {
      console.error('Failed to share', err)
    } finally {
      setShowShareModal(false)
    }
  }

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
              <div className="text-blue-800 font-bold text-sm leading-none" style={customFontStyle}>{hours}</div>
              <div className="text-blue-600 text-[8px] leading-none" style={customFontStyle}>HRS</div>
            </div>
            <span className="text-blue-800 font-bold">:</span>
            <div className="bg-white px-2 py-0.5 rounded border border-black text-center">
              <div className="text-blue-800 font-bold text-sm leading-none" style={customFontStyle}>{minutes}</div>
              <div className="text-blue-600 text-[8px] leading-none" style={customFontStyle}>MIN</div>
            </div>
            <span className="text-blue-800 font-bold">:</span>
            <div className="bg-white px-2 py-0.5 rounded border border-black text-center">
              <div className="text-blue-800 font-bold text-sm leading-none" style={customFontStyle}>{seconds}</div>
              <div className="text-blue-600 text-[8px] leading-none" style={customFontStyle}>SEC</div>
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
            <div className="bg-green-100 border-4 border-green-800 rounded-xl py-2 text-center text-green-800 font-bold">
              ✅ Connected {wallet.address.slice(0,6)}...{wallet.address.slice(-4)}
            </div>
          ) : (
            <div className="w-full bg-yellow-100 border-4 border-yellow-800 rounded-xl py-1 text-center text-yellow-800 font-bold">
              ❌ Wallet not connected
            </div>
          )}

          {/* Referral Code Input (First Entry Only) */}
          {showReferralInput && canUseReferral && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl border-2 border-purple-300 p-4 w-full">
              <p className="text-red-700 font-bold mb-2 text-center" style={customFontStyle}>
                🎁 Have a Referral Code?
              </p>
              <p className="text-xs text-red-500 mb-3 text-center">
                Optional: Enter a friend&apos;s code to get bonus toppings! Or skip to continue.
              </p>
              <input
                type="text"
                placeholder="Enter code (optional)"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                className="w-full p-2 border-2 border-purple-300 rounded-lg mb-2 text-center font-bold text-black placeholder:text-black"
                maxLength={10}
              />
              <div className="w-full">
                <Button
                  className="!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-lg w-full border-4 border-green-800 uppercase"
                  style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
                  onClick={handleEnterWithReferral}
                  disabled={isEntryInProgress}
                >
                  {isEntryInProgress ? 'Processing...' : (
                    <>
                      <span className="text-xl">🍕</span> ENTER GAME <span className="text-xl">🍕</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}


          {/* Main Action Button (Approve / Enter) - hidden during first-entry referral prompt */}
          {!(showReferralInput && canUseReferral) && (
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
              {isEntryInProgress ? 'Processing...' : (
                buttonConfig.text.includes('🍕') ? (
                  <>
                    <span className="text-xl">🍕</span> {buttonConfig.text.replace(/🍕/g, '').trim()} <span className="text-xl">🍕</span>
                  </>
                ) : (
                  buttonConfig.text
                )
              )}
            </Button>
          )}

          {/* Referral Code Management */}
          {wallet?.isAuthenticated && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl border-2 border-red-300 p-3 w-full" style={{ borderColor: '#000000' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-red-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  <Users className="inline mr-1 h-4 w-4" /> Your Referral Code
                </p>
                {referralInfo?.referralCode && (
                  <Button
                    className="!bg-red-600 hover:!bg-red-700 text-white text-xs py-1 px-2 rounded"
                    onClick={() => setShowShareModal(true)}
                  >
                    <Share2 className="inline h-3 w-3 mr-1" />
                    Share
                  </Button>
                )}
              </div>
              
    <div>
      <p className="text-red-900 text-xl text-center mb-1 tracking-wider" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
        {referralInfo?.referralCode
          ? referralInfo.referralCode
          : referralInfo === null
            ? 'Loading...'
            : 'Code not available'}
      </p>
      <p className="text-xs text-red-600 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
        Referrals: {Number(referralInfo?.totalReferrals ?? 0n)}/3 this week • {Number(referralInfo?.lifetimeReferrals ?? 0n)} lifetime
      </p>
      <p className="text-xs text-red-500 text-center mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
        Invite friends to earn 2 toppings each! (Max 3/week)
      </p>
    </div>
            </div>
          )}

          {/* Weekly Jackpot Button */}
          <Button
            className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl border-4 border-yellow-800 w-full uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            onClick={() => {
              if (onNavigateToWeekly) {
                onNavigateToWeekly()
                return
              }
              alert('Weekly Jackpot coming soon!')
            }}
          >
            <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
            Claim Toppings
            <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
          </Button>

          {/* Leaderboard Button */}
          <Button
            className="!bg-red-700 hover:!bg-red-800 text-white font-bold py-2 rounded-xl border-4 border-red-900 w-full uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            onClick={() => {
              if (onNavigateToLeaderboard) {
                onNavigateToLeaderboard()
                return
              }
              alert('Leaderboard coming soon!')
            }}
          >
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            Leaderboard
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
          </Button>

          {/* Own a Parlor Button */}
          <Button
            onClick={onNavigateToParlor}
            className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2 rounded-xl border-4 border-orange-800 uppercase cursor-pointer"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
          >
            🍍 OWN A PARLOR 🍍
          </Button>

          {/* Staking Button */}
          <Button
            onClick={onNavigateToStaking}
            className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-900 uppercase cursor-pointer"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
          >
            🍕 Spin & Stake 🍕
          </Button>

          {/* Manage Wallet Button (when connected) */}
          {shouldShowManageWallet && (
            <Button
              className="!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 w-full uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              onClick={() => openWalletModal()}
            >
              <Image src="/images/wallet-icon.png" alt="Wallet" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
              Manage Wallet
              <Image src="/images/wallet-icon.png" alt="Wallet" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </Button>
          )}
        </div>

        {/* Daily Entry Explained Card */}
        <Card className="border-4 border-yellow-600 rounded-2xl bg-white/95 mt-3">
          <div className="px-3 py-2">
            <p className="text-yellow-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', lineHeight: '1', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}>
              Daily Entry Explained
            </p>
            <ul className="space-y-0.5 text-yellow-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>Must hold PIZZA tokens to play</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>One entry per wallet per day (resets 12pm PST)</span>
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
                <span>New games are called when a new player enters after 12pm PST</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🍅</span>
                <span>Daily pot breakdown: 80% Public, 10% Stakers, 7% Parlor Owners, 3% Charities</span>
              </li>
            </ul>
          </div>
        </Card>

      </div>

      {showShareModal && referralCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-3xl border-4 border-red-600 w-full max-w-sm p-4 relative">
            <button
              className="absolute top-2 right-2 text-red-700 hover:text-red-900"
              onClick={() => setShowShareModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-center text-red-800 font-bold mb-2" style={customFontStyle}>
              Share your referral code
            </p>
            <p className="text-center text-xs text-red-500 mb-3">
              {referralCode} • {referralShareUrl}
            </p>
            <div className="flex flex-col gap-2">
              {SHARE_PLATFORMS.map((platform) => (
                <Button
                  key={platform.name}
                  className={`${platform.color} text-white font-bold py-2 rounded-xl border-2 border-red-200 flex items-center justify-center gap-2`}
                  onClick={() => handleShareOption(platform)}
                >
                  <span className="flex items-center justify-center">{platform.icon}</span>
                  <span>
                    {platform.action === 'copy' ? 'Copy referral message' : `Share on ${platform.name}`}
                  </span>
                </Button>
              ))}
            </div>
            {shareCopied && (
              <p className="text-green-700 text-sm text-center mt-3" style={customFontStyle}>
                Copied! Paste anywhere to invite friends.
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
