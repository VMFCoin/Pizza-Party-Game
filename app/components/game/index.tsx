'use client'

import { Suspense, useState, useMemo } from 'react'
import Image from 'next/image'
import { Button } from '../ui/button'
import { Users, Gift, Copy } from 'lucide-react'
import { useGamePageData } from '../../lib/useGamePageData'

export default function GamePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GamePageContent />
    </Suspense>
  )
}

function GamePageContent() {
  const {
    wallet,
    vmfUsd,
    vmfAmount,
    daily,
    playerInfo,
    referralInfo,
    pacificCountdown,
    openWalletModal,
    handleEnterGame,
    handleApproveVMF,
    handleCreateReferralCode,
    isEntryInProgress,
    hasEnteredToday,
    hasEnoughVMF,
    needsApproval,
  } = useGamePageData()

  const [referralCodeInput, setReferralCodeInput] = useState('')
  const [showReferralInput, setShowReferralInput] = useState(false)
  const [copied, setCopied] = useState(false)

  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: 'bold' as const,
  }

  // Debug render
  console.debug('GamePageContent render — hasEnteredToday:', hasEnteredToday)

  // Check if this is user's first entry ever
  const isFirstEntry = playerInfo?.dailyEntries === 0n

  // Determine main action button state
  const buttonConfig = useMemo(() => {
    if (!wallet?.isAuthenticated) {
      return { text: '🍕 CONNECT WALLET 🍕', onClick: openWalletModal, disabled: false }
    }
    if (hasEnteredToday) {
      return { text: '✅ ALREADY ENTERED TODAY', onClick: () => {}, disabled: true }
    }
    if (!hasEnoughVMF) {
      return { text: `NEED ${vmfAmount} VMF TO PLAY`, onClick: () => {}, disabled: true }
    }
    if (needsApproval) {
      return { text: '🔓 APPROVE VMF', onClick: handleApproveVMF, disabled: isEntryInProgress }
    }
    return { 
      text: '🍕 ENTER GAME 🍕', 
      onClick: () => {
        // If first entry, show referral input modal
        if (isFirstEntry) {
          setShowReferralInput(true)
        } else {
          // Not first entry - enter without referral code (pass empty string)
          handleEnterGame('')
        }
      }, 
      disabled: isEntryInProgress 
    }
  }, [wallet, hasEnteredToday, hasEnoughVMF, needsApproval, vmfAmount, openWalletModal, handleApproveVMF, handleEnterGame, isEntryInProgress, isFirstEntry])

  const { hours, minutes, seconds } = pacificCountdown

  // Handle referral code submission
  const handleEnterWithReferral = () => {
    const code = referralCodeInput.trim()
    handleEnterGame(code.length > 0 ? code : undefined)
    setShowReferralInput(false)
    setReferralCodeInput('')
  }

  // Handle referral code copy
  const handleCopyReferralCode = async () => {
    if (referralInfo?.referralCode) {
      try {
        await navigator.clipboard.writeText(referralInfo.referralCode)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

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

        {/* Header / Daily Jackpot */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border-4 border-black p-4 text-center w-full">
          <h1 className="mb-2" style={{
            padding: "3px",
            textAlign: "center",
            transform: "-rotate-2",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              ...customFontStyle,
              color: "#DC2626",
              textShadow: "2px 2px 0px #991B1B, 4px 4px 0px #7F1D1D, 6px 6px 10px rgba(0,0,0,0.3)",
              letterSpacing: "0px",
              fontWeight: "900",
              WebkitTextStroke: "1px #450A0A",
              background: "linear-gradient(45deg, #DC2626, #EF4444, #F87171)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 3px #DC2626)",
              fontSize: "32px",
              whiteSpace: "nowrap",
            }}>
              EVERY 24 HOURS!
            </div>
            <div style={{
              ...customFontStyle,
              color: "#DC2626",
              textShadow: "2px 2px 0px #991B1B, 4px 4px 0px #7F1D1D, 6px 6px 10px rgba(0,0,0,0.3)",
              letterSpacing: "-1px",
              fontWeight: "900",
              WebkitTextStroke: "1px #450A0A",
              background: "linear-gradient(45deg, #DC2626, #EF4444, #F87171)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 3px #DC2626)",
              fontSize: isMobile ? "26px" : "31px",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}>
              8 SLICES, 8 WINNERS!
            </div>
          </h1>

          <div className="bg-blue-100/90 backdrop-blur-sm p-3 rounded-xl border-2 border-blue-300 mb-2">
            <p className="text-blue-600 text-xl font-bold" style={customFontStyle}>Daily Jackpot</p>
            <p className="text-blue-800 text-3xl font-bold" style={customFontStyle}>
              {daily.loading ? '⏳' : `$${(Number(daily.jackpot) * vmfUsd).toFixed(2)}`}
            </p>

            <p className="text-blue-600 text-sm mt-1">
              {daily.loading
                ? 'Loading entries...'
                : `Total entries: ${daily.totalEntries} • Game #${daily.dailyGameId}`}
            </p>

            {daily.isCompleted && !daily.loading && (
              <p className="text-xs text-blue-700 mt-1">This game has been finalized.</p>
            )}
            {daily.error && (
              <p className="text-xs text-red-600 mt-1">Error loading daily data</p>
            )}
          </div>

          {/* Player Stats */}
          {wallet?.isAuthenticated && playerInfo && (
            <div className="bg-yellow-100/90 backdrop-blur-sm p-2 rounded-xl border-2 border-yellow-300 mt-2">
              <p className="text-yellow-800 text-sm font-bold" style={customFontStyle}>
                🍕 Your Stats: {Number(playerInfo.totalToppings)} Toppings • {Number(playerInfo.dailyEntries)} Entries
              </p>
            </div>
          )}
        </div>

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
          {showReferralInput && isFirstEntry && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl border-2 border-purple-300 p-4 w-full">
              <p className="text-purple-800 font-bold mb-2 text-center" style={customFontStyle}>
                🎁 Have a Referral Code?
              </p>
              <p className="text-xs text-purple-600 mb-3 text-center">
                Optional: Enter a friend&apos;s code to get bonus toppings! Or skip to continue.
              </p>
              <input
                type="text"
                placeholder="Enter code (optional)"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                className="w-full p-2 border-2 border-purple-300 rounded-lg mb-2 text-center font-bold"
                maxLength={10}
              />
              <div className="flex gap-2">
                <Button
                  className="!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-lg flex-1"
                  onClick={handleEnterWithReferral}
                  disabled={isEntryInProgress}
                >
                  {referralCodeInput.trim() ? 'Enter with Code' : 'Enter Game'}
                </Button>
                <Button
                  className="!bg-gray-400 hover:!bg-gray-500 text-white font-bold py-2 rounded-lg px-4"
                  onClick={() => setShowReferralInput(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}


          {/* Main Action Button (Approve / Enter) */}
          <Button
            className={`!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 w-full ${buttonConfig.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={customFontStyle}
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

          {/* Referral Code Management */}
          {wallet?.isAuthenticated && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl border-2 border-red-300 p-3 w-full">
              <div className="flex items-center justify-between mb-2">
                <p className="text-red-800 font-bold text-sm" style={customFontStyle}>
                  <Users className="inline mr-1 h-4 w-4" /> Your Referral Code
                </p>
                {referralInfo?.referralCode && (
                  <Button
                    className="!bg-red-600 hover:!bg-red-700 text-white text-xs py-1 px-2 rounded"
                    onClick={handleCopyReferralCode}
                  >
                    <Copy className="inline h-3 w-3 mr-1" />
                    {copied ? '✅' : 'Copy'}
                  </Button>
                )}
              </div>
              
              {referralInfo?.referralCode ? (
                <div>
                  <p className="text-red-900 font-bold text-xl text-center mb-1 tracking-wider">
                    {referralInfo.referralCode}
                  </p>
                  <p className="text-xs text-red-600 text-center">
                    Referrals: {Number(referralInfo.totalReferrals)}/3 this week • {Number(referralInfo.lifetimeReferrals)} lifetime
                  </p>
                  <p className="text-xs text-red-500 text-center mt-1">
                    Invite friends to earn 2 toppings each! (Max 3/week)
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-red-600 text-center mb-2">
                    Create your code to invite friends and earn bonus toppings!
                  </p>
                  <Button
                    className="!bg-red-600 hover:!bg-red-700 text-white font-bold py-2 rounded-lg w-full text-sm"
                    onClick={handleCreateReferralCode}
                    disabled={isEntryInProgress}
                  >
                    <Gift className="inline mr-1 h-4 w-4" /> Create Referral Code
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Weekly Jackpot Button */}
          <Button
            className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl border-4 border-yellow-800 w-full uppercase"
            style={customFontStyle}
            onClick={() => alert('Weekly Jackpot coming soon!')}
          >
            <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
            Weekly Jackpot
            <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
          </Button>

          {/* Leaderboard Button */}
          <Button
            className="!bg-red-700 hover:!bg-red-800 text-white font-bold py-2 rounded-xl border-4 border-red-900 w-full uppercase"
            style={customFontStyle}
            onClick={() => alert('Leaderboard coming soon!')}
          >
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            Leaderboard
            <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
          </Button>

          {/* Manage Wallet Button (when connected) */}
          {wallet?.isAuthenticated && wallet?.address && (
            <Button
              className="!bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 w-full uppercase"
              style={customFontStyle}
              onClick={() => openWalletModal()}
            >
              <Image src="/images/wallet-icon.png" alt="Wallet" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
              Manage Wallet
              <Image src="/images/wallet-icon.png" alt="Wallet" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </Button>
          )}
        </div>

        {/* Countdown */}
        <div className="bg-blue-50 p-4 rounded-xl border-4 border-black w-full text-center">
          <div className="flex items-center justify-center mb-2">
            <Image src="/images/alarm-clock-icon.png" alt="Alarm Clock" width={20} height={20} className="mr-2" />
            <p className="font-semibold text-blue-800" style={customFontStyle}>Next Draw In:</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white p-2 rounded">
              <div className="text-xl font-bold text-blue-800" style={customFontStyle}>{hours}</div>
              <div className="text-xs text-blue-600" style={customFontStyle}>HRS</div>
            </div>
            <div className="bg-white p-2 rounded">
              <div className="text-xl font-bold text-blue-800" style={customFontStyle}>{minutes}</div>
              <div className="text-xs text-blue-600" style={customFontStyle}>MIN</div>
            </div>
            <div className="bg-white p-2 rounded">
              <div className="text-xl font-bold text-blue-800" style={customFontStyle}>{seconds}</div>
              <div className="text-xs text-blue-600" style={customFontStyle}>SEC</div>
            </div>
          </div>
        </div>

        {/* Info Footer */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border-4 border-black p-3 w-full text-center text-xs text-gray-600">
          <p className="mb-1">🎮 Entry Fee: ${(Number(vmfAmount) * vmfUsd).toFixed(2)} (~{vmfAmount} VMF)</p>
          <p>🍕 Earn 1 topping per entry • Toppings = Weekly Jackpot tickets!</p>
        </div>

      </div>
    </main>
  )
}
