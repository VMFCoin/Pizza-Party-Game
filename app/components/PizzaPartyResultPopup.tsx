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
          const pot = gameData.potAmount as bigint
          const playersPool = (pot * 9400n) / 10000n
          const numberOfWinners = BigInt(winners.length || 1)
          const winnerShare = playersPool / numberOfWinners
          const remainder = playersPool - (winnerShare * numberOfWinners)
          const isFirstWinner = winners[0]?.toLowerCase() === address.toLowerCase()

          let userPayout = winnerShare
          if (isFirstWinner) {
            userPayout += remainder
          }

          const vmfAmount = Number(userPayout) / 1e18
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
        {/* X Button - SAME FOR BOTH CARDS */}
        <button
          onClick={handleClose}
          className="absolute -top-2 -right-2 z-50 w-16 h-16 bg-[#2D2D2D] rounded-full flex items-center justify-center hover:bg-[#1D1D1D] transition-colors shadow-xl"
          aria-label="Close"
        >
          <X className="w-9 h-9 text-white" />
        </button>

        {isWinner ? (
          /* ========================================
             WINNER CARD - Fully Responsive
             ======================================== */
          <div 
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '400/230' }}
          >
            <div className="absolute inset-4 border-4 border-black rounded-2xl" />

            {/* WINNER Text - Fully Responsive */}
            <div 
              className="absolute top-6 left-1/2 -translate-x-1/2 text-center"
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
                  fontSize: 'clamp(3rem, 8vw, 6rem)',
                }}
              >
                WINNER
              </h1>
            </div>

            {/* Won Big? Share The Dough! - Responsive */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ top: '35%' }}
            >
              <p 
                className="font-bold text-black" 
                style={{ 
                  ...customFontStyle, 
                  fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' 
                }}
              >
                Won Big? Share The Dough!
              </p>
            </div>

            {/* You Won - Responsive, 8px below previous */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ top: 'calc(35% + 32px + 8px)' }}
            >
              <p 
                className="font-bold text-white" 
                style={{ 
                  ...customFontStyle, 
                  fontSize: 'clamp(1.25rem, 3vw, 1.875rem)' 
                }}
              >
                You Won
              </p>
            </div>

            {/* VMF Amount - Responsive, 8px below previous, DYNAMIC VALUE */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
              style={{ top: 'calc(35% + 32px + 8px + 36px + 8px)' }}
            >
              <p 
                className="font-bold text-white"
                style={{
                  ...customFontStyle,
                  textShadow: '4px 4px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
                  fontSize: 'clamp(2.5rem, 6vw, 4rem)',
                }}
              >
                {vmfWon} VMF
              </p>
            </div>

            {/* Share Button - Responsive, FUNCTIONAL */}
            <button
              onClick={handleShare}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all px-14 py-3 rounded-full border-4 border-black shadow-xl"
            >
              <p 
                className="font-bold text-white"
                style={{
                  ...customFontStyle,
                  textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                  fontSize: 'clamp(1.25rem, 2.5vw, 1.875rem)',
                }}
              >
                SHARE
              </p>
            </button>
          </div>
        ) : (
          /* ========================================
             LOSER CARD - Fully Responsive
             ======================================== */
          <div 
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '400/230' }}
          >
            <div className="absolute inset-4 border-4 border-black rounded-2xl" />

            {/* NOT A WINNER Text - Fully Responsive */}
            <div 
              className="absolute top-6 left-1/2 -translate-x-1/2 text-center"
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
                  fontSize: 'clamp(2.5rem, 7vw, 5rem)',
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
                  marginTop: '8px',
                  fontSize: 'clamp(2.5rem, 7vw, 5rem)',
                }}
              >
                WINNER
              </h1>
            </div>

            {/* Message Text - Fully Responsive, 8px spacing between all lines */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ bottom: '12%' }}
            >
              <p 
                className="font-bold text-black whitespace-nowrap" 
                style={{ 
                  ...customFontStyle, 
                  marginBottom: '8px',
                  fontSize: 'clamp(1.25rem, 3.5vw, 2.25rem)',
                }}
              >
                Keep Playing To Claim
              </p>
              <p 
                className="font-bold text-black whitespace-nowrap" 
                style={{ 
                  ...customFontStyle, 
                  marginBottom: '8px',
                  fontSize: 'clamp(1.25rem, 3.5vw, 2.25rem)',
                }}
              >
                More Toppings.
              </p>
              <p 
                className="font-bold text-black whitespace-nowrap" 
                style={{ 
                  ...customFontStyle,
                  fontSize: 'clamp(1.25rem, 3.5vw, 2.25rem)',
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
