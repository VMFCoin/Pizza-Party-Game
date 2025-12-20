'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { readContract } from '@wagmi/core'
import { wagmiConfig as config } from './config/wagmiConfig'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI, PARLOR_MANAGER_ADDRESS, PARLOR_MANAGER_ABI } from '../lib/constants'
import { useGamePageData } from '../lib/useGamePageData'
import { sdk } from '@farcaster/miniapp-sdk'

const SHARE_BASE_URL = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

type PopupType = 'freeSlice' | 'winner' | 'loser'

export function PizzaPartyResultPopup() {
  const { address, isConnected } = useAccount()
  const { referralInfo } = useGamePageData()

  // Queue of popups to show (in order)
  const [popupQueue, setPopupQueue] = useState<PopupType[]>([])
  const [currentPopup, setCurrentPopup] = useState<PopupType | null>(null)

  // Winner/loser state
  const [winType, setWinType] = useState<'daily' | 'weekly' | 'both' | null>(null)
  const [dailyPizzaWon, setDailyPizzaWon] = useState(0)
  const [weeklyPizzaWon, setWeeklyPizzaWon] = useState(0)
  const [pizzaUsd, setPizzaUsd] = useState(0.01)

  // Free slice state
  const [sponsorName, setSponsorName] = useState<string | null>(null)

  const [hasChecked, setHasChecked] = useState(false)
  const [currentDailyGameIdRef, setCurrentDailyGameIdRef] = useState<bigint>(0n)
  const [lastSettledDailyGameIdRef, setLastSettledDailyGameIdRef] = useState<bigint>(0n)
  const [lastSettledWeeklyGameIdRef, setLastSettledWeeklyGameIdRef] = useState<bigint>(0n)

  // Calculate total PIZZA won
  const totalPizzaWon = dailyPizzaWon + weeklyPizzaWon

  // Fetch PIZZA/USD price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/price')
        const data = await res.json()
        if (data.priceUsd) {
          setPizzaUsd(parseFloat(data.priceUsd))
        }
      } catch (error) {
        console.error('Failed to fetch PIZZA price:', error)
      }
    }
    fetchPrice()
  }, [])

  // Show next popup in queue
  useEffect(() => {
    if (popupQueue.length > 0 && currentPopup === null) {
      const [next, ...rest] = popupQueue
      setCurrentPopup(next)
      setPopupQueue(rest)
    }
  }, [popupQueue, currentPopup])

  useEffect(() => {
    if (!isConnected || !address || hasChecked) return

    const checkGameResults = async () => {
      try {
        const popupsToShow: PopupType[] = []
        let isDailyWinner = false
        let isWeeklyWinner = false
        let dailyPayout = 0
        let weeklyPayout = 0

        // Get current game IDs
        const currentDailyGameId = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGameId',
        }) as bigint

        const currentWeeklyGameId = await readContract(config, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'weeklyGameId',
        }) as bigint

        const lastSettledDailyGameId = currentDailyGameId - 1n
        const lastSettledWeeklyGameId = currentWeeklyGameId - 1n

        // Store for use in handleClose
        setCurrentDailyGameIdRef(currentDailyGameId)
        setLastSettledDailyGameIdRef(lastSettledDailyGameId)
        setLastSettledWeeklyGameIdRef(lastSettledWeeklyGameId)

        // ===== STEP 1: Check for PREVIOUS game results (winner/loser) =====
        const resultSeenKey = `pizza_party_seen_daily_${lastSettledDailyGameId}_weekly_${lastSettledWeeklyGameId}`
        const hasSeenResult = typeof window !== 'undefined' ? localStorage.getItem(resultSeenKey) : null

        if (!hasSeenResult && lastSettledDailyGameId >= 1n) {
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
              }

              // Check weekly results
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
                    const weeklyShare = weeklyPot / numberOfWeeklyWinners
                    weeklyPayout = Number(weeklyShare) / 1e18
                  }
                }
              }

              // Set winner/loser state
              if (isDailyWinner || isWeeklyWinner) {
                setDailyPizzaWon(dailyPayout)
                setWeeklyPizzaWon(weeklyPayout)
                if (isDailyWinner && isWeeklyWinner) {
                  setWinType('both')
                } else if (isWeeklyWinner) {
                  setWinType('weekly')
                } else {
                  setWinType('daily')
                }
                popupsToShow.push('winner')
              } else {
                popupsToShow.push('loser')
              }
            }
          }
        }

        // ===== STEP 2: Check for free slice in CURRENT game =====
        const freeSliceSeenKey = `pizza_party_seen_freeslice_${currentDailyGameId}`
        const hasSeenFreeSlice = typeof window !== 'undefined' ? localStorage.getItem(freeSliceSeenKey) : null

        if (!hasSeenFreeSlice) {
          const sponsor = await readContract(config, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'dailySliceSponsor',
            args: [currentDailyGameId, address as `0x${string}`],
          }) as `0x${string}`

          if (sponsor && sponsor !== '0x0000000000000000000000000000000000000000') {
            // Try to get sponsor's franchise name
            try {
              const franchiseName = await readContract(config, {
                address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
                abi: PARLOR_MANAGER_ABI,
                functionName: 'parlorName',
                args: [sponsor],
              }) as string

              if (franchiseName && franchiseName.length > 0) {
                setSponsorName(franchiseName)
              }
            } catch {
              // Ignore errors fetching franchise name
            }

            popupsToShow.push('freeSlice')
          }
        }

        // Set the queue and mark as checked
        if (popupsToShow.length > 0) {
          setPopupQueue(popupsToShow)
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
    if (isConnected && address && currentPopup) {
      try {
        if (currentPopup === 'freeSlice') {
          // Mark free slice as seen
          const freeSliceSeenKey = `pizza_party_seen_freeslice_${currentDailyGameIdRef}`
          localStorage.setItem(freeSliceSeenKey, 'true')
        } else {
          // Mark winner/loser result as seen
          const seenKey = `pizza_party_seen_daily_${lastSettledDailyGameIdRef}_weekly_${lastSettledWeeklyGameIdRef}`
          localStorage.setItem(seenKey, 'true')
        }
      } catch (error) {
        console.error('Error saving seen state:', error)
      }
    }
    setCurrentPopup(null) // This will trigger the next popup if there's one in the queue
  }

  const handleShare = async () => {
    const usdValue = (totalPizzaWon * pizzaUsd).toFixed(2)
    const referralCode = referralInfo?.referralCode ?? ''
    const referralShareUrl = referralCode ? `${SHARE_BASE_URL}${referralCode}` : SHARE_BASE_URL

    const shareText = referralCode
      ? `Just sliced $${usdValue} of $PIZZA in Pizza Party! Who's next? Come get this dough!\n\nDaily and Weekly Jackpots paying out the cheese, use my referral code: ${referralCode}\n\nWe all win together!`
      : `Just sliced $${usdValue} of $PIZZA in Pizza Party! Who's next? Come get this dough!\n\nDaily and Weekly Jackpots paying out the cheese!\n\nWe all win together!`

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

  if (!currentPopup) return null

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

        {currentPopup === 'winner' && (
          /* WINNER CARD */
          <div
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '360/260' }}
          >
            <div className="absolute inset-3 sm:inset-4 border-4 border-black rounded-2xl" />

            <div className="relative z-10 h-full w-full px-5 sm:px-7 py-5 sm:py-6 flex flex-col justify-center items-center text-center">
              <div className="w-full">
                <h1
                  className="font-black"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    color: '#FFA500',
                    textShadow: '1px 1px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                    WebkitTextStroke: '1.5px black',
                    fontWeight: 900,
                    letterSpacing: '0.035em',
                    fontSize: winType === 'both' ? 'clamp(1.5rem, 5.5vw, 2.5rem)' : 'clamp(1.9rem, 6.5vw, 3rem)',
                    lineHeight: '1',
                    margin: '0',
                  }}
                >
                  {getWinnerTitle()}
                </h1>
              </div>

              <div className="leading-tight" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                <p
                  className="text-black"
                  style={{ fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', lineHeight: '1.2', margin: '0' }}
                >
                  Won Big? Share The Dough!
                </p>
                <p
                  className="text-white"
                  style={{ fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)', lineHeight: '1.2', margin: '0' }}
                >
                  You Won
                </p>
                <p
                  className="text-white whitespace-nowrap"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    textShadow: '2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                    fontSize: 'clamp(1.9rem, 6.8vw, 3rem)',
                    lineHeight: '1.1',
                    margin: '0',
                  }}
                >
                  ${(totalPizzaWon * pizzaUsd).toFixed(2)} of $PIZZA
                </p>
              </div>

              <div className="w-full flex justify-center mt-2">
                <button
                  onClick={handleShare}
                  className="bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all rounded-full border-4 border-black shadow-xl px-6 py-1.5 w-full max-w-[200px]"
                >
                  <p
                    className="text-white whitespace-nowrap"
                    style={{
                      fontFamily: 'var(--font-luckiest-guy)',
                      textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                      fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)',
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
        )}

        {currentPopup === 'loser' && (
          /* LOSER CARD */
          <div
            className="relative w-full bg-gradient-to-br from-red-600 to-red-700 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '360/220' }}
          >
            <div className="absolute inset-3 sm:inset-4 border-4 border-black rounded-2xl" />

            <div className="relative z-10 h-full w-full px-4 sm:px-6 py-5 sm:py-6 flex flex-col items-center justify-center text-center">
              <div>
                <h1
                  className="font-black"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    color: '#FFA500',
                    textShadow: '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
                    WebkitTextStroke: '2px black',
                    fontWeight: 900,
                    letterSpacing: '0.04em',
                    fontSize: 'clamp(1.8rem, 7vw, 3.5rem)',
                    lineHeight: '1',
                    margin: '0',
                  }}
                >
                  NOT A WINNER
                </h1>
              </div>

              <div style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                <p
                  className="text-black"
                  style={{ fontSize: 'clamp(1rem, 4vw, 1.75rem)', lineHeight: '1.3', margin: '0' }}
                >
                  Keep Playing To Claim
                </p>
                <p
                  className="text-black"
                  style={{ fontSize: 'clamp(1rem, 4vw, 1.75rem)', lineHeight: '1.3', margin: '0' }}
                >
                  More Toppings.
                </p>
                <p
                  className="text-black"
                  style={{ fontSize: 'clamp(1rem, 4vw, 1.75rem)', lineHeight: '1.3', margin: '0' }}
                >
                  Grow The Weekly Jackpot.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentPopup === 'freeSlice' && (
          /* FREE SLICE CARD */
          <div
            className="relative w-full bg-gradient-to-br from-green-500 to-green-600 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: '360/260' }}
          >
            <div className="absolute inset-3 sm:inset-4 border-4 border-black rounded-2xl" />

            <div className="relative z-10 h-full w-full px-5 sm:px-7 py-5 sm:py-6 flex flex-col justify-center items-center text-center">
              <div className="w-full">
                <h1
                  className="font-black"
                  style={{
                    fontFamily: 'var(--font-luckiest-guy)',
                    color: '#FFA500',
                    textShadow: '1px 1px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
                    WebkitTextStroke: '1.5px black',
                    fontWeight: 900,
                    letterSpacing: '0.035em',
                    fontSize: 'clamp(1.5rem, 5.5vw, 2.5rem)',
                    lineHeight: '1',
                    margin: '0',
                  }}
                >
                  FREE SLICE!
                </h1>
              </div>

              <div className="leading-tight mt-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                <p
                  className="text-white"
                  style={{
                    fontSize: 'clamp(1rem, 3.5vw, 1.5rem)',
                    lineHeight: '1.3',
                    margin: '0',
                    textShadow: '1px 1px 0px #000',
                  }}
                >
                  {sponsorName ? `${sponsorName} sent you` : 'Someone sent you'}
                </p>
                <p
                  className="text-white"
                  style={{
                    fontSize: 'clamp(1rem, 3.5vw, 1.5rem)',
                    lineHeight: '1.3',
                    margin: '0',
                    textShadow: '1px 1px 0px #000',
                  }}
                >
                  a free entry!
                </p>
              </div>

              <div className="mt-3" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                <p
                  className="text-black"
                  style={{ fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', lineHeight: '1.2', margin: '0' }}
                >
                  You&apos;re in today&apos;s game!
                </p>
                <p
                  className="text-black"
                  style={{ fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', lineHeight: '1.2', margin: '0' }}
                >
                  Good luck!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
