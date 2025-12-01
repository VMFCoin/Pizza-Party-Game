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
          // Calculate payout exactly as contract does
          const pot = gameData.potAmount as bigint
          const playersPool = (pot * 9400n) / 10000n
          const numberOfWinners = BigInt(winners.length || 1)
          const winnerShare = playersPool / numberOfWinners
          const playersRemainder = playersPool - (winnerShare * numberOfWinners)
          
          // Find user's position in winners array
          const userIndex = winners.findIndex((w: string) => w.toLowerCase() === address.toLowerCase())
          
          // Calculate base payout
          let userPayout = winnerShare
          if (userIndex === 0) {
            userPayout += playersRemainder  // First winner gets remainder
          }
          
          // Check if user was also first player (gets 1% bonus)
          let firstPlayerBonus = 0n
          if (gameData.firstPlayer?.toLowerCase() === address.toLowerCase()) {
            firstPlayerBonus = (pot * 100n) / 10000n  // 1% bonus
          }
          
          // Calculate dust (any remaining after all allocations)
          const totalAllocated = (pot * 100n / 10000n) + (pot * 500n / 10000n) + playersPool
          const dust = pot > totalAllocated ? pot - totalAllocated : 0n
          
          // First winner gets dust
          let dustShare = 0n
          if (userIndex === 0 && dust > 0n) {
            dustShare = dust
          }
          
          // Total = winner share + first player bonus (if applicable) + dust (if applicable)
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
      {/* CARD SCALES DOWN ON MOBILE - Layout stays identical */}
      <div
        className="relative w-full"
        style={{
          maxWidth: 'min(800px, 100vw - 32px)',
          transform: 'scale(min(1, (100vw - 32px) / 800))',
          transformOrigin: 'center center',
        }}
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
          /* WINNER CARD - EXACT LAYOUT FROM HTML PREVIEW */
          <div 
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ 
              aspectRatio: '400/230',
              width: '800px',
            }}
          >
            <div className="absolute inset-4 border-4 border-black rounded-2xl" />

            {/* WINNER Text */}
            <div 
              className="absolute top-6 left-1/2 -translate-x-1/2 text-center"
              style={customFontStyle}
            >
              <h1 
                className="text-7xl md:text-8xl font-black"
                style={{
                  color: '#FFA500',
                  textShadow: '5px 5px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  transform: 'scaleY(1.1)',
                }}
              >
                WINNER
              </h1>
            </div>

            {/* Won Big? Share The Dough! */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ top: '35%' }}
            >
              <p className="text-xl md:text-2xl font-bold text-black" style={customFontStyle}>
                Won Big? Share The Dough!
              </p>
            </div>

            {/* You Won */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ top: 'calc(35% + 32px + 8px)' }}
            >
              <p className="text-2xl md:text-3xl font-bold text-white" style={customFontStyle}>
                You Won
              </p>
            </div>

            {/* VMF Amount - DYNAMIC VALUE */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
              style={{ top: 'calc(35% + 32px + 8px + 36px + 8px)' }}
            >
              <p 
                className="text-5xl md:text-6xl font-bold text-white"
                style={{
                  ...customFontStyle,
                  textShadow: '4px 4px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
                }}
              >
                {vmfWon} VMF
              </p>
            </div>

            {/* Share Button - FUNCTIONAL */}
            <button
              onClick={handleShare}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all px-14 py-3 rounded-full border-4 border-black shadow-xl"
            >
              <p 
                className="text-xl md:text-2xl font-bold text-white"
                style={{
                  ...customFontStyle,
                  textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                }}
              >
                SHARE
              </p>
            </button>
          </div>
        ) : (
          /* LOSER CARD */
          <div 
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ 
              aspectRatio: '400/230',
              width: '800px',
            }}
          >
            <div className="absolute inset-4 border-4 border-black rounded-2xl" />

            {/* NOT A WINNER Text */}
            <div 
              className="absolute top-3 left-1/2 -translate-x-1/2 text-center"
              style={customFontStyle}
            >
              <h1 
                className="text-6xl md:text-7xl font-black"
                style={{
                  color: '#FFA500',
                  textShadow: '5px 5px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  transform: 'scaleY(1.1)',
                }}
              >
                NOT A
              </h1>
              <h1 
                className="text-6xl md:text-7xl font-black"
                style={{
                  color: '#FFA500',
                  textShadow: '5px 5px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
                  WebkitTextStroke: '4px black',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  transform: 'scaleY(1.1)',
                  marginTop: '8px',
                }}
              >
                WINNER
              </h1>
            </div>

            {/* Message Text */}
            <div 
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ bottom: '10%' }}
            >
              <p 
                className="text-3xl md:text-4xl font-bold text-black whitespace-nowrap" 
                style={{ 
                  ...customFontStyle, 
                  marginBottom: '8px',
                }}
              >
                Keep Playing To Claim
              </p>
              <p 
                className="text-3xl md:text-4xl font-bold text-black whitespace-nowrap" 
                style={{ 
                  ...customFontStyle, 
                  marginBottom: '8px',
                }}
              >
                More Toppings.
              </p>
              <p 
                className="text-3xl md:text-4xl font-bold text-black whitespace-nowrap" 
                style={customFontStyle}
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
