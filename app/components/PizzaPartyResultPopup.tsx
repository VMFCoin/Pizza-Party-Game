'use client'

import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useAccount } from 'wagmi'
import { readContract } from '@wagmi/core'
import { wagmiConfig as config } from './config/wagmiConfig'
import { PIZZA_PARTY_ADDRESS, PIZZA_PARTY_ABI, PARLOR_MANAGER_ADDRESS, PARLOR_MANAGER_ABI } from '../lib/constants'
import { useGamePageData } from '../lib/useGamePageData'
import { fetchProfilesByAddresses } from '../lib/farcasterProfiles'
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
  const [totalPizzaWon, setTotalPizzaWon] = useState(0) // Combined total of all winnings (PIZZA, used for share text)
  // USD amounts shown on the card use settlement-time USD snapshot, matching the leaderboard.
  const [personalUsd, setPersonalUsd] = useState(0) // Personal lottery winnings in USD (settlement-time)
  const [sponsorUsd, setSponsorUsd] = useState(0) // Sponsor rewards in USD (settlement-time)
  const [sliceeNames, setSliceeNames] = useState<string[]>([]) // Farcaster handles of sponsored winners
  const [pizzaUsd, setPizzaUsd] = useState<number | null>(null) // live price, used only for share text

  // Free slice state
  const [sponsorName, setSponsorName] = useState<string | null>(null)
  const [needsSliceClaim, setNeedsSliceClaim] = useState(false) // true = pending slice needs claim, false = already claimed
  const [isClaiming, setIsClaiming] = useState(false)

  const [hasChecked, setHasChecked] = useState(false)
  const [currentDailyGameIdRef, setCurrentDailyGameIdRef] = useState<bigint>(0n)
  const [lastSettledDailyGameIdRef, setLastSettledDailyGameIdRef] = useState<bigint>(0n)
  const [lastSettledWeeklyGameIdRef, setLastSettledWeeklyGameIdRef] = useState<bigint>(0n)

  // Contract write for claiming slice
  const [isClaimPending, setIsClaimPending] = useState(false)
  const isClaimConfirming = false
  const [isClaimSuccess, setIsClaimSuccess] = useState(false)

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
  const handleClaimSlice = useCallback(async () => {
    if (!address || isClaiming || isClaimPending || isClaimConfirming) return

    setIsClaiming(true)

    // Get the price - use cached value or fetch fresh
    let price = pizzaUsd
    if (!price) {
      try {
        const res = await fetch('/api/price')
        const data = await res.json()
        if (data.priceUsd) {
          price = parseFloat(data.priceUsd)
          setPizzaUsd(price)
        }
      } catch (error) {
        console.error('Failed to fetch price for claim:', error)
        setIsClaiming(false)
        return
      }
    }

    if (!price) {
      console.error('Could not get price for claim')
      setIsClaiming(false)
      return
    }

    // Calculate $1 worth of PIZZA in wei
    // price is the price of 1 PIZZA in USD
    const pizzaPerDollar = 1 / price
    const entryFeeWei = BigInt(Math.floor(pizzaPerDollar * 1e18))

    setIsClaimPending(true)
    try {
      const res = await fetch('/api/slice/claim-backend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerAddress: address, entryFeeAmount: entryFeeWei.toString() }),
      })
      const data = await res.json()
      if (data.success) {
        setIsClaimSuccess(true)
      }
    } catch (err) {
      console.error('[PizzaPartyResultPopup] claimSlice error:', err)
    }
    setIsClaimPending(false)
    setIsClaiming(false)
  }, [address, isClaiming, isClaimPending, isClaimConfirming, pizzaUsd])

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

  // Reset hasChecked when address changes (new user or reconnection)
  useEffect(() => {
    setHasChecked(false)
  }, [address])

  useEffect(() => {
    if (!isConnected || !address || hasChecked) return

    const checkGameResults = async () => {
      try {
        const popupsToShow: PopupType[] = []
        let isDailyWinner = false
        let isWeeklyWinner = false
        let hasSponsorEarnings = false // Track if user earned from sponsoring winners
        let combinedPayout = 0 // Total of all winnings in PIZZA (used for share text)
        let personalCents = 0 // Personal lottery winnings in USD cents (settlement-time)
        let sponsorCents = 0 // Sponsor rewards in USD cents (settlement-time)
        const sponsoredWinnerAddresses: string[] = [] // winners this user sponsored

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

        // ===== PRIORITY CHECK: Free slice (check FIRST so it shows immediately) =====
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
              // User has a pending slice - they need to claim it
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
            // hasPendingSlice check failed - log but continue
            console.error('[FreeSlice] hasPendingSlice check failed:', err)
          }

          // Also check if already claimed (dailySliceSponsor on PizzaParty)
          // This handles slices that were already claimed
          if (!foundFreeSlice) {
            try {
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
            } catch {
              // Ignore dailySliceSponsor errors
            }
          }
        }

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

              // Settlement-time USD per winner (cents). Matches the leaderboard display.
              const dailyUsdCentsPerWinner = Number(await readContract(config, {
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'getDailyGameUsdValue',
                args: [lastSettledDailyGameId],
              }) as bigint)

              const userIsDailyWinner = winners.some(
                (winner) => winner.toLowerCase() === address.toLowerCase()
              )

              if (userIsDailyWinner) {
                isDailyWinner = true
                const pot = gameData.potAmount as bigint
                // Winners receive 80% of pot (after 10% stakers, 7% parlor, 3% charity deductions)
                const playersPool = (pot * 8000n) / 10000n
                const numberOfWinners = BigInt(winners.length || 1)
                const winnerShare = playersPool / numberOfWinners

                let userPayout = winnerShare
                let userUsdCents = dailyUsdCentsPerWinner

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
                  userUsdCents = Math.floor(userUsdCents / 2)
                }

                const dailyPayoutNumber = Number(userPayout) / 1e18
                personalCents += userUsdCents
                combinedPayout += dailyPayoutNumber
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
                  const playersPool = (pot * 8000n) / 10000n
                  const numberOfWinners = BigInt(winners.length || 1)
                  const winnerBaseShare = playersPool / numberOfWinners
                  const sponsorReward = winnerBaseShare / 2n
                  const sponsorRewardNumber = Number(sponsorReward) / 1e18
                  combinedPayout += sponsorRewardNumber
                  sponsorCents += Math.floor(dailyUsdCentsPerWinner / 2)
                  sponsoredWinnerAddresses.push(winner)
                  hasSponsorEarnings = true
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

            const weeklyUsdCentsPerWinner = Number(await readContract(config, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'getWeeklyGameUsdValue',
              args: [lastSettledWeeklyGameId],
            }) as bigint)

            const userIsWeeklyWinner = weeklyWinners.some(
              (winner) => winner.toLowerCase() === address.toLowerCase()
            )

            if (userIsWeeklyWinner) {
              isWeeklyWinner = true
              const weeklyPot = weeklyGameData.potAmount as bigint
              const numberOfWeeklyWinners = BigInt(weeklyWinners.length || 1)
              const weeklyShare = weeklyPot / numberOfWeeklyWinners

              let userWeeklyPayout = weeklyShare
              let userWeeklyCents = weeklyUsdCentsPerWinner

              // Check if user was sponsored for weekly (50/50 split means they get half)
              const userWeeklySponsor = await readContract(config, {
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'weeklySliceSponsor',
                args: [lastSettledWeeklyGameId, address as `0x${string}`],
              }) as `0x${string}`

              if (userWeeklySponsor && userWeeklySponsor !== '0x0000000000000000000000000000000000000000') {
                // User was sponsored - they only get 50% of their share
                userWeeklyPayout = userWeeklyPayout / 2n
                userWeeklyCents = Math.floor(userWeeklyCents / 2)
              }

              const weeklyPayoutNumber = Number(userWeeklyPayout) / 1e18
              personalCents += userWeeklyCents
              combinedPayout += weeklyPayoutNumber
            }

            // Check if user sponsored any weekly winners (they get 50% of those winnings)
            for (const winner of weeklyWinners) {
              const winnerWeeklySponsor = await readContract(config, {
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'weeklySliceSponsor',
                args: [lastSettledWeeklyGameId, winner],
              }) as `0x${string}`

              if (winnerWeeklySponsor?.toLowerCase() === address.toLowerCase()) {
                // User sponsored this weekly winner! They get 50% of winner's base share
                const weeklyPot = weeklyGameData.potAmount as bigint
                const numberOfWeeklyWinners = BigInt(weeklyWinners.length || 1)
                const winnerBaseShare = weeklyPot / numberOfWeeklyWinners
                const sponsorReward = winnerBaseShare / 2n
                const sponsorRewardNumber = Number(sponsorReward) / 1e18
                combinedPayout += sponsorRewardNumber
                sponsorCents += Math.floor(weeklyUsdCentsPerWinner / 2)
                sponsoredWinnerAddresses.push(winner)
                hasSponsorEarnings = true
              }
            }
          }
        }

        // Determine win type and show appropriate popup
        const hasUnseenResults = !hasSeenDailyResult || !hasSeenWeeklyResult
        // Show winner popup if user won personally OR earned from sponsoring winners
        if (hasUnseenResults && (isDailyWinner || isWeeklyWinner || hasSponsorEarnings)) {
          setTotalPizzaWon(combinedPayout)
          setPersonalUsd(personalCents / 100)
          setSponsorUsd(sponsorCents / 100)

          // Resolve Farcaster handles for sponsored winners so the popup can tell
          // the user *which* slicee triggered the sponsor bonus.
          if (sponsoredWinnerAddresses.length > 0) {
            try {
              const profiles = await fetchProfilesByAddresses(sponsoredWinnerAddresses)
              const names = sponsoredWinnerAddresses.map((addr) => {
                const p = profiles.get(addr.toLowerCase())
                if (p?.username) return `@${p.username}`
                return `${addr.slice(0, 6)}…${addr.slice(-4)}`
              })
              setSliceeNames(names)
            } catch {
              setSliceeNames(sponsoredWinnerAddresses.map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`))
            }
          }

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
          // Only mark as seen if they've claimed (needsSliceClaim = false)
          // If they close without claiming, reset hasChecked so popup shows again
          if (!needsSliceClaim) {
            const freeSliceSeenKey = `pizza_party_seen_freeslice_${currentDailyGameIdRef}`
            localStorage.setItem(freeSliceSeenKey, 'true')
          } else {
            // They closed without claiming - reset so it shows again next time
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
    const usdValue = totalUsd.toFixed(2)
    const referralCode = referralInfo?.referralCode ?? ''
    const referralShareUrl = referralCode ? `${SHARE_BASE_URL}${referralCode}` : SHARE_BASE_URL

    const shareText = referralCode
      ? `Just sliced $${usdValue} of $PIZZA in Pizza Party and the oven is still blazing.\n\nStake your $PIZZA. Spin the Pie. Enter the Daily. Build toward the Weekly Jackpot.\n\nAnd remember — this is the only mini app on Base donating daily to Veteran charities.\n\nUse my referral code: ${referralCode}\n\nThe more we stake, spin, and play… the bigger the pie gets.\n\nWe all win together.`
      : `Just sliced $${usdValue} of $PIZZA in Pizza Party and the oven is still blazing.\n\nStake your $PIZZA. Spin the Pie. Enter the Daily. Build toward the Weekly Jackpot.\n\nAnd remember — this is the only mini app on Base donating daily to Veteran charities.\n\nThe more we stake, spin, and play… the bigger the pie gets.\n\nWe all win together.`

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

  // Determine if this is purely sponsor earnings (no personal wins)
  const isPureSponsorEarnings = sponsorUsd > 0 && personalUsd === 0
  const totalUsd = personalUsd + sponsorUsd

  // Get the title based on win type and earnings source
  const getWinnerTitle = () => {
    if (isPureSponsorEarnings) {
      return 'YOUR SLICEE WON!'
    }
    switch (winType) {
      case 'both':
        return 'JACKPOT WINNER'
      case 'weekly':
        return 'WEEKLY WINNER'
      default:
        return 'WINNER'
    }
  }

  // Get the subtitle/description based on earnings type
  const getWinnerSubtitle = () => {
    if (isPureSponsorEarnings) {
      return 'Sponsor Reward'
    }
    if (sponsorUsd > 0 && personalUsd > 0) {
      return 'Won + Sponsor Reward'
    }
    return 'Won Big? Share The Dough!'
  }

  // Human-readable list of slicees whose win triggered the user's sponsor bonus.
  // Users often assume the reward came from their most recent gifted slice — name
  // them explicitly so there's no ambiguity about which slicee actually won.
  const sliceeLabel = sliceeNames.length === 0
    ? ''
    : sliceeNames.length === 1
      ? sliceeNames[0]
      : sliceeNames.length === 2
        ? `${sliceeNames[0]} & ${sliceeNames[1]}`
        : `${sliceeNames.slice(0, -1).join(', ')} & ${sliceeNames[sliceeNames.length - 1]}`

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
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
                  {getWinnerSubtitle()}
                </p>
                <p
                  className="text-white"
                  style={{ fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)', lineHeight: '1.2', margin: '0' }}
                >
                  {isPureSponsorEarnings ? 'You Earned' : 'You Won'}
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
                  ${totalUsd.toFixed(2)} of $PIZZA
                </p>
                {/* Show breakdown if user has both personal wins and sponsor earnings */}
                {sponsorUsd > 0 && personalUsd > 0 && (
                  <p
                    className="text-black"
                    style={{ fontSize: 'clamp(0.7rem, 2.2vw, 0.9rem)', lineHeight: '1.2', margin: '4px 0 0 0' }}
                  >
                    (${personalUsd.toFixed(2)} won + ${sponsorUsd.toFixed(2)} sponsor)
                  </p>
                )}
                {/* Tell the user *which* slicee triggered the sponsor bonus */}
                {sponsorUsd > 0 && sliceeLabel && (
                  <p
                    className="text-black"
                    style={{ fontSize: 'clamp(0.65rem, 2vw, 0.85rem)', lineHeight: '1.2', margin: '2px 0 0 0' }}
                  >
                    Your slicee {sliceeLabel} won!
                  </p>
                )}
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
