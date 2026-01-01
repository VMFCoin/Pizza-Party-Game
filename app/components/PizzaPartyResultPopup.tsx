'use client'

import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
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

  // Winner/loser state - now includes sponsor rewards
  const [winType, setWinType] = useState<'daily' | 'weekly' | 'both' | null>(null)
  const [totalPizzaWon, setTotalPizzaWon] = useState(0) // Combined total of all winnings
  const [pizzaUsd, setPizzaUsd] = useState(0.01)

  // Free slice state
  const [sponsorName, setSponsorName] = useState<string | null>(null)
  const [needsSliceClaim, setNeedsSliceClaim] = useState(false) // true = pending slice needs claim, false = already claimed
  const [isClaiming, setIsClaiming] = useState(false)

  const [hasChecked, setHasChecked] = useState(false)
  const [currentDailyGameIdRef, setCurrentDailyGameIdRef] = useState<bigint>(0n)
  const [lastSettledDailyGameIdRef, setLastSettledDailyGameIdRef] = useState<bigint>(0n)
  const [lastSettledWeeklyGameIdRef, setLastSettledWeeklyGameIdRef] = useState<bigint>(0n)

  // Contract write for claiming slice
  const { writeContract, data: claimTxHash, isPending: isClaimPending } = useWriteContract()
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimTxHash,
  })

  // Handle successful slice claim - update UI to show claimed state
  useEffect(() => {
    if (isClaimSuccess && currentPopup === 'freeSlice' && needsSliceClaim) {
      // Mark as seen and show confirmed state
      const freeSliceSeenKey = `pizza_party_seen_freeslice_${currentDailyGameIdRef}`
      localStorage.setItem(freeSliceSeenKey, 'true')
      setNeedsSliceClaim(false)
      setIsClaiming(false)
    }
  }, [isClaimSuccess, currentPopup, currentDailyGameIdRef, needsSliceClaim])

  // Claim slice handler - calculates $1 worth of PIZZA for treasury contribution
  const handleClaimSlice = useCallback(() => {
    if (!address || isClaiming || isClaimPending || isClaimConfirming) return

    // Calculate $1 worth of PIZZA in wei
    // pizzaUsd is the price of 1 PIZZA in USD
    const pizzaPerDollar = 1 / pizzaUsd
    const entryFeeWei = BigInt(Math.floor(pizzaPerDollar * 1e18))

    setIsClaiming(true)
    writeContract({
      address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
      abi: PARLOR_MANAGER_ABI,
      functionName: 'claimSlice',
      args: [entryFeeWei],
    })
  }, [address, isClaiming, isClaimPending, isClaimConfirming, writeContract, pizzaUsd])

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
        let combinedPayout = 0 // Total of all winnings (daily + weekly + sponsor rewards)

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

        // ===== STEP 1: Check for PREVIOUS daily game results =====
        // Use SEPARATE keys for daily and weekly to avoid duplicate popups
        const dailyResultSeenKey = `pizza_party_seen_daily_${lastSettledDailyGameId}`
        const weeklyResultSeenKey = `pizza_party_seen_weekly_${lastSettledWeeklyGameId}`
        const hasSeenDailyResult = typeof window !== 'undefined' ? localStorage.getItem(dailyResultSeenKey) : null
        const hasSeenWeeklyResult = typeof window !== 'undefined' ? localStorage.getItem(weeklyResultSeenKey) : null

        // Check daily game if not already seen
        if (!hasSeenDailyResult && lastSettledDailyGameId >= 1n) {
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

                // Check if user was sponsored (50/50 split means they get half)
                const userSponsor = await readContract(config, {
                  address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                  abi: PIZZA_PARTY_ABI,
                  functionName: 'dailySliceSponsor',
                  args: [lastSettledDailyGameId, address as `0x${string}`],
                }) as `0x${string}`

                if (userSponsor && userSponsor !== '0x0000000000000000000000000000000000000000') {
                  // User was sponsored - they only get 50% of their share
                  userPayout = userPayout / 2n
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

                const dailyPayout = userPayout + firstPlayerBonus + dustShare
                combinedPayout += Number(dailyPayout) / 1e18
              }

              // Check if user sponsored any daily winners (they get 50% of those winnings)
              for (const winner of winners) {
                const winnerSponsor = await readContract(config, {
                  address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                  abi: PIZZA_PARTY_ABI,
                  functionName: 'dailySliceSponsor',
                  args: [lastSettledDailyGameId, winner],
                }) as `0x${string}`

                if (winnerSponsor?.toLowerCase() === address.toLowerCase()) {
                  // User sponsored this winner! They get 50% of winner's base share
                  const pot = gameData.potAmount as bigint
                  const playersPool = (pot * 9400n) / 10000n
                  const numberOfWinners = BigInt(winners.length || 1)
                  const winnerBaseShare = playersPool / numberOfWinners
                  const sponsorReward = winnerBaseShare / 2n
                  combinedPayout += Number(sponsorReward) / 1e18
                  isDailyWinner = true // Mark as winner since they earned from sponsorship
                }
              }
            }
          }
        }

        // ===== STEP 2: Check weekly game if not already seen =====
        if (!hasSeenWeeklyResult && lastSettledWeeklyGameId >= 1n) {
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
              combinedPayout += Number(weeklyShare) / 1e18
            }
          }
        }

        // Determine win type and show appropriate popup
        const hasUnseenResults = !hasSeenDailyResult || !hasSeenWeeklyResult
        if (hasUnseenResults && (isDailyWinner || isWeeklyWinner)) {
          setTotalPizzaWon(combinedPayout)
          if (isDailyWinner && isWeeklyWinner) {
            setWinType('both')
          } else if (isWeeklyWinner) {
            setWinType('weekly')
          } else {
            setWinType('daily')
          }
          popupsToShow.push('winner')
        } else if (!hasSeenDailyResult && lastSettledDailyGameId >= 1n) {
          // Only show loser popup if they played but didn't win
          const hasPlayed = await readContract(config, {
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            abi: PIZZA_PARTY_ABI,
            functionName: 'hasPlayedDaily',
            args: [lastSettledDailyGameId, address as `0x${string}`],
          }) as boolean
          if (hasPlayed) {
            popupsToShow.push('loser')
          }
        }

        // ===== STEP 3: Check for PENDING slice (needs to be claimed) or already claimed slice =====
        const freeSliceSeenKey = `pizza_party_seen_freeslice_${currentDailyGameId}`
        const hasSeenFreeSlice = typeof window !== 'undefined' ? localStorage.getItem(freeSliceSeenKey) : null
        let foundFreeSlice = false

        if (!hasSeenFreeSlice) {
          // First check for pending slice on ParlorManager (needs claiming)
          try {
            const pendingSliceResult = await readContract(config, {
              address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
              abi: PARLOR_MANAGER_ABI,
              functionName: 'hasPendingSlice',
              args: [address as `0x${string}`],
            })

            // Handle both array and object return formats from wagmi
            let hasPending: boolean
            let pendingSponsor: `0x${string}`

            if (Array.isArray(pendingSliceResult)) {
              [hasPending, pendingSponsor] = pendingSliceResult as [boolean, `0x${string}`]
            } else if (pendingSliceResult && typeof pendingSliceResult === 'object') {
              // wagmi might return as object with named properties
              const result = pendingSliceResult as { hasPending?: boolean; sponsor?: `0x${string}`; 0?: boolean; 1?: `0x${string}` }
              hasPending = result.hasPending ?? result[0] ?? false
              pendingSponsor = result.sponsor ?? result[1] ?? '0x0000000000000000000000000000000000000000'
            } else {
              hasPending = false
              pendingSponsor = '0x0000000000000000000000000000000000000000'
            }

            if (hasPending && pendingSponsor !== '0x0000000000000000000000000000000000000000') {
              // User has a pending slice - show popup with claim button
              setNeedsSliceClaim(true)
              foundFreeSlice = true

              // Try to get sponsor's franchise name
              try {
                const franchiseName = await readContract(config, {
                  address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
                  abi: PARLOR_MANAGER_ABI,
                  functionName: 'parlorName',
                  args: [pendingSponsor],
                }) as string

                if (franchiseName && franchiseName.length > 0) {
                  setSponsorName(franchiseName)
                }
              } catch {
                // Ignore errors fetching franchise name
              }

              popupsToShow.push('freeSlice')
            }
          } catch (err) {
            // hasPendingSlice doesn't exist yet (contract not upgraded) - check old way
            console.log('hasPendingSlice not available, checking dailySliceSponsor:', err)
          }

          // Also check if already claimed (dailySliceSponsor on PizzaParty)
          // This handles slices that were already claimed or from pre-upgrade
          if (!foundFreeSlice) {
            const sponsor = await readContract(config, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'dailySliceSponsor',
              args: [currentDailyGameId, address as `0x${string}`],
            }) as `0x${string}`

            if (sponsor && sponsor !== '0x0000000000000000000000000000000000000000') {
              // Already claimed - no need to claim again
              setNeedsSliceClaim(false)

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
          // Only mark free slice as seen if they've already claimed (needsSliceClaim = false)
          // If they still need to claim, don't mark as seen so it shows again next time
          if (!needsSliceClaim) {
            const freeSliceSeenKey = `pizza_party_seen_freeslice_${currentDailyGameIdRef}`
            localStorage.setItem(freeSliceSeenKey, 'true')
          } else {
            // They closed without claiming - reset hasChecked so popup shows again on next home visit
            setHasChecked(false)
          }
        } else if (currentPopup === 'winner' || currentPopup === 'loser') {
          // Mark BOTH daily and weekly results as seen with separate keys
          const dailySeenKey = `pizza_party_seen_daily_${lastSettledDailyGameIdRef}`
          const weeklySeenKey = `pizza_party_seen_weekly_${lastSettledWeeklyGameIdRef}`
          localStorage.setItem(dailySeenKey, 'true')
          localStorage.setItem(weeklySeenKey, 'true')
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
          /* FREE SLICE CARD - Shows claim button if pending, or confirmation if claimed */
          <div
            className="relative w-full bg-gradient-to-br from-green-500 to-green-600 rounded-3xl border-4 border-black shadow-2xl overflow-hidden"
            style={{ aspectRatio: needsSliceClaim ? '360/300' : '360/260' }}
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

              {needsSliceClaim ? (
                /* Show claim button */
                <>
                  <div className="w-full flex justify-center mt-4">
                    <button
                      onClick={handleClaimSlice}
                      disabled={isClaiming || isClaimPending || isClaimConfirming}
                      className="bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition-all rounded-full border-4 border-black shadow-xl px-8 py-2 w-full max-w-[280px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p
                        className="text-white whitespace-nowrap"
                        style={{
                          fontFamily: 'var(--font-luckiest-guy)',
                          textShadow: '2px 2px 0px #000, -1px -1px 0px #000',
                          fontSize: 'clamp(1.1rem, 4vw, 1.6rem)',
                          lineHeight: '1',
                          margin: '0',
                        }}
                      >
                        {isClaiming || isClaimPending || isClaimConfirming ? 'CLAIMING...' : 'CLAIM YOUR SLICE!'}
                      </p>
                    </button>
                  </div>

                  <div className="mt-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <p
                      className="text-black"
                      style={{ fontSize: 'clamp(0.8rem, 2.5vw, 1rem)', lineHeight: '1.2', margin: '0' }}
                    >
                      Tap to enter today&apos;s game
                    </p>
                  </div>
                </>
              ) : (
                /* Show confirmation */
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
