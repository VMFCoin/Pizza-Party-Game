'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { readContract } from '@wagmi/core'
import { wagmiConfig as config } from './config/wagmiConfig'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI } from '../lib/constants'
import { useGamePageData } from '../lib/useGamePageData'
import { sdk } from '@farcaster/miniapp-sdk'

const SHARE_BASE_URL = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

type WinType = 'daily' | 'weekly' | 'both' | null

export function PizzaPartyResultPopup() {
  const { address, isConnected } = useAccount()
  const { referralInfo } = useGamePageData()
  const [showPopup, setShowPopup] = useState(false)
  const [isWinner, setIsWinner] = useState(false)
  const [winType, setWinType] = useState<WinType>(null)
  const [dailyVmfWon, setDailyVmfWon] = useState(0)
  const [weeklyVmfWon, setWeeklyVmfWon] = useState(0)
  const [vmfUsd, setVmfUsd] = useState(0.01)
  const [hasChecked, setHasChecked] = useState(false)

  // Calculate total VMF won
  const totalVmfWon = dailyVmfWon + weeklyVmfWon

  // Fetch VMF/USD price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/price')
        const data = await res.json()
        if (data.priceUsd) {
          setVmfUsd(parseFloat(data.priceUsd))
        }
      } catch (error) {
        console.error('Failed to fetch VMF price:', error)
      }
    }
    fetchPrice()
  }, [])

  useEffect(() => {
    if (!isConnected || !address || hasChecked) return

    const checkGameResults = async () => {
      try {
        let isDailyWinner = false
        let isWeeklyWinner = false
        let dailyPayout = 0
        let weeklyPayout = 0
        let lastSettledDailyGameId = 0n
        let lastSettledWeeklyGameId = 0n

        // Check daily game result
        const currentDailyGameId = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGameId',
        }) as bigint

        lastSettledDailyGameId = currentDailyGameId - 1n

        // Check if we've already seen this combination of results
        const currentWeeklyGameId = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'weeklyGameId',
        }) as bigint

        lastSettledWeeklyGameId = currentWeeklyGameId - 1n

        const seenKey = `pizza_party_seen_daily_${lastSettledDailyGameId}_weekly_${lastSettledWeeklyGameId}`
        const hasSeenResult = typeof window !== 'undefined' ? localStorage.getItem(seenKey) : null

        if (hasSeenResult) {
          setHasChecked(true)
          return
        }

        // Check daily results
        if (lastSettledDailyGameId >= 1n) {
          const hasPlayed = await readContract(config, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'hasPlayedDaily',
            args: [lastSettledDailyGameId, address as `0x${string}`],
          }) as boolean

          if (hasPlayed) {
            const gameData = await readContract(config, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'dailyGames',
              args: [lastSettledDailyGameId],
            }) as {
              settled: boolean
              potAmount: bigint
              firstPlayer?: `0x${string}`
            }

            if (gameData.settled) {
              const winners = await readContract(config, {
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'getDailyGameWinners',
                args: [lastSettledDailyGameId],
              }) as `0x${string}`[]

              const userIsDailyWinner = winners.some(
                (winner) => winner.toLowerCase() === address.toLowerCase()
              )

              if (userIsDailyWinner) {
                isDailyWinner = true
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

                const totalDailyPayout = userPayout + firstPlayerBonus + dustShare
                dailyPayout = Number(totalDailyPayout) / 1e18

                console.log('Daily VMF Calculation:', {
                  pot: (Number(pot) / 1e18).toFixed(2),
                  playersPool: (Number(playersPool) / 1e18).toFixed(2),
                  winnerShare: (Number(winnerShare) / 1e18).toFixed(2),
                  totalPayout: dailyPayout,
                })
              }
            }
          }
        }

        // Check weekly results (only if there's a settled weekly game)
        if (lastSettledWeeklyGameId >= 1n) {
          const weeklyGameData = await readContract(config, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'weeklyGames',
            args: [lastSettledWeeklyGameId],
          }) as {
            settled: boolean
            potAmount: bigint
          }

          if (weeklyGameData.settled) {
            const weeklyWinners = await readContract(config, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'getWeeklyGameWinners',
              args: [lastSettledWeeklyGameId],
            }) as `0x${string}`[]

            const userIsWeeklyWinner = weeklyWinners.some(
              (winner) => winner.toLowerCase() === address.toLowerCase()
            )

            if (userIsWeeklyWinner) {
              isWeeklyWinner = true
              const weeklyPot = weeklyGameData.potAmount as bigint
              const numberOfWeeklyWinners = BigInt(weeklyWinners.length || 1)
              // Weekly jackpot is split evenly among winners (no fees like daily)
              const weeklyShare = weeklyPot / numberOfWeeklyWinners
              weeklyPayout = Number(weeklyShare) / 1e18

              console.log('Weekly VMF Calculation:', {
                pot: (Number(weeklyPot) / 1e18).toFixed(2),
                numberOfWinners: weeklyWinners.length,
                payoutPerWinner: weeklyPayout,
              })
            }
          }
        }

        // Set state based on results
        if (isDailyWinner || isWeeklyWinner) {
          setIsWinner(true)
          setDailyVmfWon(dailyPayout)
          setWeeklyVmfWon(weeklyPayout)

          if (isDailyWinner && isWeeklyWinner) {
            setWinType('both')
          } else if (isWeeklyWinner) {
            setWinType('weekly')
          } else {
            setWinType('daily')
          }
          setShowPopup(true)
        } else {
          // Check if user played daily but didn't win - show loser card
          if (lastSettledDailyGameId >= 1n) {
            const hasPlayed = await readContract(config, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'hasPlayedDaily',
              args: [lastSettledDailyGameId, address as `0x${string}`],
            }) as boolean

            if (hasPlayed) {
              const gameData = await readContract(config, {
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'dailyGames',
                args: [lastSettledDailyGameId],
              }) as { settled: boolean }

              if (gameData.settled) {
                setIsWinner(false)
                setShowPopup(true)
              }
            }
          }
        }

        setHasChecked(true)
      } catch (error) {
        console.error('Error checking game results:', error)
        setHasChecked(true)
      }
    }

    void checkGameResults()
  }, [isConnected, address, hasChecked])

  const handleClose = async () => {
    if (isConnected && address) {
      try {
        const [currentDailyGameId, currentWeeklyGameId] = await Promise.all([
          readContract(config, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'dailyGameId',
          }),
          readContract(config, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'weeklyGameId',
          }),
        ])

        const lastSettledDailyGameId = (currentDailyGameId as bigint) - 1n
        const lastSettledWeeklyGameId = (currentWeeklyGameId as bigint) - 1n
        const seenKey = `pizza_party_seen_daily_${lastSettledDailyGameId}_weekly_${lastSettledWeeklyGameId}`
        localStorage.setItem(seenKey, 'true')
      } catch (error) {
        console.error('Error saving seen state:', error)
      }
    }
    setShowPopup(false)
  }

  const handleShare = async () => {
    const usdValue = (totalVmfWon * vmfUsd).toFixed(2)
    const referralCode = referralInfo?.referralCode ?? ''
    const referralShareUrl = referralCode ? `${SHARE_BASE_URL}${referralCode}` : SHARE_BASE_URL

    const shareText = referralCode
      ? `🍕 Just sliced $${usdValue} of $VMF in Pizza Party! Who's next? Come get this dough!\nDaily and Weekly Jackpots paying out the cheese, use my referral code: ${referralCode}\nWe all win together! 🍕`
      : `🍕 Just sliced $${usdValue} of $VMF in Pizza Party! Who's next? Come get this dough!\nDaily and Weekly Jackpots paying out the cheese!\nWe all win together! 🍕`

    try {
      const actions = sdk.actions as {
        openUrl?: (url: string) => Promise<void>
      }

      const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(referralShareUrl)}`

      if (typeof actions.openUrl === 'function') {
        await actions.openUrl(castUrl)
        return
      }

      window.open(castUrl, '_blank')
    } catch (error) {
      console.error('Failed to share:', error)

      try {
        await navigator.clipboard.writeText(`${shareText}\n${referralShareUrl}`)
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

  // Get the title based on win type
  const getWinnerTitle = () => {
    switch (winType) {
      case 'both':
        return 'JACKPOT WINNER'
      case 'weekly':
        return 'WEEKLY WINNER'
      default:
        return 'WINNER'
    }
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
            style={{ aspectRatio: '360/240' }}
          >
            <div className="absolute inset-3 sm:inset-4 border-4 border-black rounded-2xl" />

            <div className="relative z-10 h-full w-full px-5 sm:px-7 py-8 sm:py-10 flex flex-col justify-between items-center text-center gap-4">
              <div style={customFontStyle} className="w-full">
                <h1
                  className="font-black"
                  style={{
                    color: '#FFA500',
                    textShadow: '1px 1px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                    WebkitTextStroke: '1.5px black',
                    fontWeight: 900,
                    letterSpacing: '0.035em',
                    fontSize: winType === 'both' ? 'clamp(1.5rem, 5.5vw, 2.5rem)' : 'clamp(1.9rem, 6.5vw, 3rem)',
                  }}
                >
                  {getWinnerTitle()}
                </h1>
              </div>

              <div className="space-y-2 leading-tight" style={customFontStyle}>
                <p
                  className="font-bold text-black"
                  style={{ fontSize: 'clamp(0.9rem, 3vw, 1.2rem)' }}
                >
                  Won Big? Share The Dough!
                </p>
                <p
                  className="font-bold text-white"
                  style={{ fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)' }}
                >
                  You Won
                </p>
                <p
                  className="font-bold text-white whitespace-nowrap"
                  style={{
                    ...customFontStyle,
                    textShadow: '2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                    fontSize: 'clamp(1.9rem, 6.8vw, 3rem)',
                  }}
                >
                  ${(totalVmfWon * vmfUsd).toFixed(2)} of $VMF
                </p>
              </div>

              <div className="w-full flex justify-center">
                <button
                  onClick={handleShare}
                  className="bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all rounded-full border-4 border-black shadow-xl px-6 py-2 w-full max-w-[240px]"
                >
                  <p
                    className="font-bold text-white whitespace-nowrap"
                    style={{
                      ...customFontStyle,
                      textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                      fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)',
                    }}
                  >
                    SHARE
                  </p>
                </button>
              </div>
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
