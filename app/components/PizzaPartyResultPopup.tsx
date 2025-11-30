'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { readContract } from '@wagmi/core'
import { wagmiConfig as config } from './config/wagmiConfig'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { sdk } from '@farcaster/miniapp-sdk'

const SHARE_BASE_URL = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

export function PizzaPartyResultPopup() {
  const { address, isConnected } = useAccount()
  const [showPopup, setShowPopup] = useState(false)
  const [isWinner, setIsWinner] = useState(false)
  const [vmfWon, setVmfWon] = useState('0.00')
  const [hasChecked, setHasChecked] = useState(false)

  useEffect(() => {
    if (!isConnected || !address || hasChecked) return

    const checkGameResult = async () => {
      try {
        const currentGameId = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGameId',
        }) as bigint

        const lastSettledGameId = currentGameId - 1n

        if (lastSettledGameId < 1n) {
          setHasChecked(true)
          return
        }

        const seenKey = `pizza_party_seen_game_${lastSettledGameId}`
        const hasSeenResult = typeof window !== 'undefined' ? localStorage.getItem(seenKey) : null

        if (hasSeenResult) {
          setHasChecked(true)
          return
        }

        const hasPlayed = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'hasPlayedDaily',
          args: [lastSettledGameId, address as `0x${string}`],
        }) as boolean

        if (!hasPlayed) {
          setHasChecked(true)
          return
        }

        const gameData = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGames',
          args: [lastSettledGameId],
        }) as any

        if (!gameData.settled) {
          setHasChecked(true)
          return
        }

        const winners = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getDailyGameWinners',
          args: [lastSettledGameId],
        }) as `0x${string}`[]

        const userIsWinner = winners.some(
          (winner) => winner.toLowerCase() === address.toLowerCase()
        )

        if (userIsWinner) {
          // ============================================================
          // Use before/after snapshot for EXACT amount won
          // ============================================================
          
          const beforeKey = `pizza_party_vmf_before_game_${lastSettledGameId}`
          const beforeVmfStr = typeof window !== 'undefined' ? localStorage.getItem(beforeKey) : null

          let actualWonAmount = 0n

          if (beforeVmfStr) {
            // We have a before snapshot - get after snapshot
            try {
              const playerStats = await readContract(config, {
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'getPlayerLifetimeStats',
                args: [address as `0x${string}`],
              }) as readonly [bigint, bigint, bigint, bigint, bigint] | {
                totalDailyWins: bigint
                totalWeeklyWins: bigint
                totalVmfWon: bigint
                lifetimeToppings: bigint
                lifetimeReferrals: bigint
              }

              const afterTotalVmf = Array.isArray(playerStats)
                ? playerStats[2]
                : (playerStats as { totalVmfWon: bigint }).totalVmfWon

              const beforeTotalVmf = BigInt(beforeVmfStr)
              actualWonAmount = afterTotalVmf - beforeTotalVmf

              console.log('✅ EXACT win amount from contract stats:', {
                before: (Number(beforeTotalVmf) / 1e18).toFixed(2),
                after: (Number(afterTotalVmf) / 1e18).toFixed(2),
                wonThisGame: (Number(actualWonAmount) / 1e18).toFixed(2),
              })
            } catch (statsErr) {
              console.error('Failed to get after stats:', statsErr)
              // Will fall through to calculation fallback
            }
          }
          
          if (!beforeVmfStr || actualWonAmount === 0n) {
            // Fallback: calculate from game data
            console.warn('⚠️ No before snapshot or failed to get stats - using calculation fallback')
            
            const pot = gameData.potAmount as bigint
            const playersPool = (pot * 9400n) / 10000n
            const numberOfWinners = BigInt(winners.length || 1)
            const baseWinnerShare = playersPool / numberOfWinners
            const playersRemainder = playersPool - (baseWinnerShare * numberOfWinners)

            const userIndex = winners.findIndex((w: string) => w.toLowerCase() === address.toLowerCase())

            actualWonAmount = baseWinnerShare
            if (userIndex === 0) {
              actualWonAmount += playersRemainder
            }

            // First player bonus (1%)
            if (gameData.firstPlayer?.toLowerCase() === address.toLowerCase()) {
              const firstPlayerBonus = (pot * 100n) / 10000n
              actualWonAmount += firstPlayerBonus
            }

            // Dust
            const totalAllocated = (pot * 100n / 10000n) + (pot * 500n / 10000n) + playersPool
            const dust = pot > totalAllocated ? pot - totalAllocated : 0n
            if (userIndex === 0 && dust > 0n) {
              actualWonAmount += dust
            }

            console.log('📊 Calculated payout:', {
              pot: (Number(pot) / 1e18).toFixed(2),
              playersPool: (Number(playersPool) / 1e18).toFixed(2),
              baseShare: (Number(baseWinnerShare) / 1e18).toFixed(2),
              total: (Number(actualWonAmount) / 1e18).toFixed(2),
            })
          }

          const vmfAmount = Number(actualWonAmount) / 1e18
          setVmfWon(vmfAmount.toFixed(2))
          setIsWinner(true)
        } else {
          setIsWinner(false)
        }

        setShowPopup(true)
        setHasChecked(true)
      } catch (error) {
        console.error('Error checking game result:', error)
        setHasChecked(true)
      }
    }

    void checkGameResult()
  }, [isConnected, address, hasChecked])

  const handleClose = () => {
    if (isConnected && address) {
      readContract(config, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'dailyGameId',
      }).then((currentGameId) => {
        const lastSettledGameId = (currentGameId as bigint) - 1n
        const seenKey = `pizza_party_seen_game_${lastSettledGameId}`
        localStorage.setItem(seenKey, 'true')
      }).catch(console.error)
    }
    setShowPopup(false)
  }

  const handleShare = async () => {
    const shareText = `🍕 Just sliced ${vmfWon} VMF in Pizza Party! Who's next? Come get this dough! 🍕`

    try {
      const actions = sdk.actions as {
        openUrl?: (url: string) => Promise<void>
      }

      const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(SHARE_BASE_URL)}`

      if (typeof actions.openUrl === 'function') {
        await actions.openUrl(castUrl)
        return
      }

      window.open(castUrl, '_blank')
    } catch (error) {
      console.error('Failed to share:', error)

      try {
        await navigator.clipboard.writeText(`${shareText}\n${SHARE_BASE_URL}`)
        alert('Share text copied to clipboard!')
      } catch (clipboardError) {
        console.error('Clipboard failed:', clipboardError)
      }
    }
  }

  if (!showPopup) return null

  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: 'bold' as const,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X Button */}
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 z-50 w-16 h-16 bg-[#2D2D2D] rounded-full flex items-center justify-center hover:bg-[#1D1D1D] transition-colors shadow-xl"
          aria-label="Close"
        >
          <X className="w-9 h-9 text-white" />
        </button>

        {isWinner ? (
          /* WINNER CARD - FULLY RESPONSIVE & MOBILE-FIXED */
          <div
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '400/230' }}
          >
            <div className="absolute inset-4 border-4 border-black rounded-2xl" />

            {/* WINNER Text - Fully Responsive */}
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 text-center w-full px-4"
              style={customFontStyle}
            >
              <h1
                className="font-black"
                style={{
                  color: '#FFA500',
                  textShadow: '5px 5px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  transform: 'scaleY(1.1)',
                  fontSize: 'clamp(2.5rem, 10vw, 6rem)',
                }}
              >
                WINNER
              </h1>
            </div>

            {/* Won Big? Share The Dough! - Responsive - PERCENTAGE POSITIONING */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center w-full px-4"
              style={{ top: '38%' }}
            >
              <p
                className="font-bold text-black"
                style={{
                  ...customFontStyle,
                  fontSize: 'clamp(0.875rem, 3vw, 1.5rem)',
                  lineHeight: '1.2',
                }}
              >
                Won Big? Share The Dough!
              </p>
            </div>

            {/* You Won - Responsive - PERCENTAGE POSITIONING */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center w-full px-4"
              style={{ top: '50%' }}
            >
              <p
                className="font-bold text-white"
                style={{
                  ...customFontStyle,
                  fontSize: 'clamp(1rem, 3.5vw, 1.875rem)',
                  lineHeight: '1.2',
                }}
              >
                You Won
              </p>
            </div>

            {/* VMF Amount - Responsive - PERCENTAGE POSITIONING - ACTUAL VALUE FROM CONTRACT */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center w-full px-4"
              style={{ top: '62%' }}
            >
              <p
                className="font-bold text-white whitespace-nowrap"
                style={{
                  ...customFontStyle,
                  textShadow: '4px 4px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
                  fontSize: 'clamp(2rem, 8vw, 4rem)',
                  lineHeight: '1',
                }}
              >
                {vmfWon} VMF
              </p>
            </div>

            {/* Share Button - Responsive */}
            <button
              onClick={handleShare}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all rounded-full border-4 border-black shadow-xl"
              style={{
                padding: 'clamp(0.5rem, 2vw, 0.75rem) clamp(2rem, 6vw, 3.5rem)',
              }}
            >
              <p
                className="font-bold text-white whitespace-nowrap"
                style={{
                  ...customFontStyle,
                  textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                  fontSize: 'clamp(1rem, 3.5vw, 1.875rem)',
                }}
              >
                SHARE
              </p>
            </button>
          </div>
        ) : (
          /* LOSER CARD - FULLY RESPONSIVE */
          <div
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '400/230' }}
          >
            <div className="absolute inset-4 border-4 border-black rounded-2xl" />

            {/* NOT A WINNER Text - Fully Responsive */}
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 text-center w-full px-4"
              style={customFontStyle}
            >
              <h1
                className="font-black"
                style={{
                  color: '#FFA500',
                  textShadow: '5px 5px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  transform: 'scaleY(1.1)',
                  fontSize: 'clamp(2rem, 8vw, 5rem)',
                  lineHeight: '1.1',
                }}
              >
                NOT A
              </h1>
              <h1
                className="font-black"
                style={{
                  color: '#FFA500',
                  textShadow: '5px 5px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  transform: 'scaleY(1.1)',
                  marginTop: '0.25rem',
                  fontSize: 'clamp(2rem, 8vw, 5rem)',
                  lineHeight: '1.1',
                }}
              >
                WINNER
              </h1>
            </div>

            {/* Message Text - Fully Responsive */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center w-full px-4"
              style={{ bottom: '10%' }}
            >
              <p
                className="font-bold text-black whitespace-nowrap"
                style={{
                  ...customFontStyle,
                  marginBottom: 'clamp(4px, 1vw, 8px)',
                  fontSize: 'clamp(1rem, 4vw, 2.25rem)',
                  lineHeight: '1.2',
                }}
              >
                Keep Playing To Claim
              </p>
              <p
                className="font-bold text-black whitespace-nowrap"
                style={{
                  ...customFontStyle,
                  marginBottom: 'clamp(4px, 1vw, 8px)',
                  fontSize: 'clamp(1rem, 4vw, 2.25rem)',
                  lineHeight: '1.2',
                }}
              >
                More Toppings.
              </p>
              <p
                className="font-bold text-black whitespace-nowrap"
                style={{
                  ...customFontStyle,
                  fontSize: 'clamp(1rem, 4vw, 2.25rem)',
                  lineHeight: '1.2',
                }}
              >
                Grow The Weekly Jackpot
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
