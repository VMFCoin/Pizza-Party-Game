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
        }) as {
          settled: boolean
          potAmount: bigint
          firstPlayer?: `0x${string}`
        }

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
          const pot = gameData.potAmount as bigint
          const playersPool = (pot * 9400n) / 10000n
          const numberOfWinners = BigInt(winners.length || 1)
          const winnerShare = playersPool / numberOfWinners
          const playersRemainder = playersPool - (winnerShare * numberOfWinners)
          
          const userIndex = winners.findIndex((w: string) => w.toLowerCase() === address.toLowerCase())
          
          let userPayout = winnerShare
          if (userIndex === 0) {
            userPayout += playersRemainder
          }
          
          let firstPlayerBonus = 0n
          if (gameData.firstPlayer?.toLowerCase() === address.toLowerCase()) {
            firstPlayerBonus = (pot * 100n) / 10000n
          }
          
          const totalAllocated = (pot * 100n / 10000n) + (pot * 500n / 10000n) + playersPool
          const dust = pot > totalAllocated ? pot - totalAllocated : 0n
          
          let dustShare = 0n
          if (userIndex === 0 && dust > 0n) {
            dustShare = dust
          }
          
          const totalPayout = userPayout + firstPlayerBonus + dustShare
          
          const vmfAmount = Number(totalPayout) / 1e18
          setVmfWon(vmfAmount.toFixed(2))
          
          console.log('VMF Calculation:', {
            pot: (Number(pot) / 1e18).toFixed(2),
            playersPool: (Number(playersPool) / 1e18).toFixed(2),
            winnerShare: (Number(winnerShare) / 1e18).toFixed(2),
            playersRemainder: (Number(playersRemainder) / 1e18).toFixed(2),
            firstPlayerBonus: (Number(firstPlayerBonus) / 1e18).toFixed(2),
            dustShare: (Number(dustShare) / 1e18).toFixed(2),
            totalPayout: vmfAmount,
            userIndex,
            isFirstPlayer: gameData.firstPlayer?.toLowerCase() === address.toLowerCase(),
          })
          
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
      {/* FIXED: Proper width constraints and centering */}
      <div
        className="relative w-full max-w-[360px] sm:max-w-[420px] md:max-w-[520px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X Button */}
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 z-50 w-10 h-10 md:w-12 md:h-12 bg-[#2D2D2D] rounded-full flex items-center justify-center hover:bg-[#1D1D1D] transition-colors shadow-xl"
          aria-label="Close"
        >
          <X className="w-6 h-6 md:w-7 md:h-7 text-white" />
        </button>

        {isWinner ? (
          /* WINNER CARD - FULLY RESPONSIVE */
          <div 
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '360/220' }}
          >
            <div className="absolute inset-3 sm:inset-4 border-4 border-black rounded-2xl" />

            <div className="relative z-10 h-full w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col items-center justify-center gap-3 sm:gap-4 text-center">
              <div style={customFontStyle}>
                <h1 
                  className="font-black"
                  style={{
                    color: '#FFA500',
                    textShadow: '1px 1px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                    WebkitTextStroke: '1.5px black',
                    fontWeight: 900,
                    letterSpacing: '0.035em',
                    fontSize: 'clamp(2rem, 7vw, 3.2rem)',
                  }}
                >
                  WINNER
                </h1>
              </div>

              <div className="space-y-1 leading-tight" style={customFontStyle}>
                <p
                  className="font-bold text-black"
                  style={{ fontSize: 'clamp(0.9rem, 3.2vw, 1.3rem)' }}
                >
                  Won Big? Share The Dough!
                </p>
                <p
                  className="font-bold text-white"
                  style={{ fontSize: 'clamp(1rem, 3.5vw, 1.6rem)' }}
                >
                  You Won
                </p>
              </div>

              <p
                className="font-bold text-white whitespace-nowrap"
                style={{
                  ...customFontStyle,
                  textShadow: '2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                  fontSize: 'clamp(2rem, 7vw, 3.2rem)',
                }}
              >
                {vmfWon} VMF
              </p>

              <button
                onClick={handleShare}
                className="bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all rounded-full border-4 border-black shadow-xl px-5 py-2 w-full max-w-[260px] mt-1"
              >
                <p 
                  className="font-bold text-white whitespace-nowrap"
                  style={{
                    ...customFontStyle,
                    textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                    fontSize: 'clamp(1rem, 3.5vw, 1.6rem)',
                  }}
                >
                  SHARE
                </p>
              </button>
            </div>
          </div>
        ) : (
          /* LOSER CARD - FULLY RESPONSIVE */
          <div 
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '360/220' }}
          >
            <div className="absolute inset-3 sm:inset-4 border-4 border-black rounded-2xl" />

            <div className="relative z-10 h-full w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col items-center justify-center gap-5 sm:gap-6 text-center">
              <div style={customFontStyle}>
                <h1
                  className="font-black"
                  style={{
                    color: '#FFA500',
                    textShadow: '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
                    WebkitTextStroke: '2px black',
                    fontWeight: 900,
                    letterSpacing: '0.04em',
                    fontSize: 'clamp(1.8rem, 7vw, 3.5rem)',
                  }}
                >
                  NOT A WINNER
                </h1>
              </div>

              <div className="space-y-2" style={customFontStyle}>
                <p
                  className="font-bold text-black"
                  style={{ fontSize: 'clamp(1rem, 4vw, 1.75rem)' }}
                >
                  Keep Playing To Claim
                </p>
                <p
                  className="font-bold text-black"
                  style={{ fontSize: 'clamp(1rem, 4vw, 1.75rem)' }}
                >
                  More Toppings.
                </p>
                <p
                  className="font-bold text-black"
                  style={{ fontSize: 'clamp(1rem, 4vw, 1.75rem)' }}
                >
                  Grow The Weekly Jackpot.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
