'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { readContract, watchBlockNumber, getPublicClient } from '@wagmi/core'
import { useAccount, useChainId, useWriteContract, useSignTypedData } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import {
  GAME_CONSTANTS,
  PIZZA_PARTY_ADDRESS,
  PIZZA_PARTY_ABI,
  PIZZA_TOKEN_ADDRESS,
  PIZZA_TOKEN_ABI,
  PARLOR_MANAGER_ADDRESS,
  PARLOR_MANAGER_ABI,
} from './constants'
import { wagmiConfig } from '../components/config/wagmiConfig'

const PACIFIC_TZ = 'America/Los_Angeles'
const BASE_CHAIN_ID = 8453
const WEI_PER_PIZZA = 10n ** 18n
const DEFAULT_PIZZA_USD_PRICE = 0.01

// Get last known price from localStorage, fallback to default if not available
const getLastKnownPrice = (): number => {
  if (typeof window === 'undefined') return DEFAULT_PIZZA_USD_PRICE
  const stored = localStorage.getItem('pizzaUsdPrice')
  if (stored) {
    const price = parseFloat(stored)
    if (!isNaN(price) && price > 0) return price
  }
  return DEFAULT_PIZZA_USD_PRICE
}
// Monday Dec 2, 2024 at 12:00 PM PST (20:00 UTC) = block 23190127
const _WEEKLY_3_START_BLOCK = 23190127n

// ------------------ Types ------------------

interface DailyData {
  dailyGameId: number
  totalEntries: number
  jackpot: string
  isCompleted: boolean
  loading: boolean
  error: Error | null
}

interface PlayerInfo {
  totalToppings: bigint
  dailyEntries: bigint
  lastEntryTime: bigint
}

interface PlayerWeeklyInfo {
  toppingsEarned: bigint
  toppingsClaimed: bigint
  dailyPlays: bigint
  referralsUsed: bigint
  hasClaimed: boolean
  projectedHoldingsBonus: bigint
}

type PlayerWeeklyResponse =
  | readonly [bigint, bigint, bigint, bigint, boolean, bigint]
  | {
      toppingsEarned: bigint
      toppingsClaimed: bigint
      dailyPlays: bigint
      referralsUsed: bigint
      hasClaimed: boolean
      projectedHoldingsBonus: bigint
    }

const isWeeklyTuple = (
  data: PlayerWeeklyResponse,
): data is readonly [bigint, bigint, bigint, bigint, boolean, bigint] =>
  Array.isArray(data)

type WeeklyGameResponse =
  | readonly [bigint, bigint, bigint, bigint, bigint, boolean]
  | {
      claimStart: bigint
      claimEnd: bigint
      totalToppings: bigint
      claimerCount: bigint
      projectedJackpot: bigint
      settled: boolean
    }

const isWeeklyGameTuple = (
  data: WeeklyGameResponse,
): data is readonly [bigint, bigint, bigint, bigint, bigint, boolean] =>
  Array.isArray(data)

type DailyGameResponse =
  | readonly [bigint, bigint, bigint, bigint, boolean]
  | {
      startTime: bigint
      endTime: bigint
      playerCount: bigint
      pot: bigint
      settled: boolean
    }

const isDailyGameTuple = (
  data: DailyGameResponse,
): data is readonly [bigint, bigint, bigint, bigint, boolean] =>
  Array.isArray(data)

interface ReferralInfo {
  referralCode: string
  referrer: string
  totalReferrals: bigint
  lifetimeReferrals: bigint
  isActive: boolean
}

interface PlayerLifetimeStats {
  totalDailyWins: bigint
  totalWeeklyWins: bigint
  totalPizzaWon: bigint
  lifetimeToppings: bigint
  lifetimeReferrals: bigint
}

interface WeeklyData {
  claimStart: number
  claimEnd: number
  totalToppings: bigint
  claimerCount: number
  jackpotWei: bigint
  projectedJackpotWei: bigint
  projectedPlayerCount: number
  settled: boolean
  loading: boolean
  error: Error | null
}

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return ''
}

// ------------------ Helper ------------------

function getNextPacificNoonUTC(from: Date = new Date()): Date {
  const pacificNow = toZonedTime(from, PACIFIC_TZ)
  const pacificTarget = new Date(
    pacificNow.getFullYear(),
    pacificNow.getMonth(),
    pacificNow.getDate(),
    12, 0, 0, 0
  )
  if (pacificNow.getTime() >= pacificTarget.getTime())
    pacificTarget.setDate(pacificTarget.getDate() + 1)
  return fromZonedTime(pacificTarget, PACIFIC_TZ)
}

const normalizeWeeklyInfo = (data: PlayerWeeklyResponse): PlayerWeeklyInfo => {
  if (isWeeklyTuple(data)) {
    return {
      toppingsEarned: data[0],
      toppingsClaimed: data[1],
      dailyPlays: data[2],
      referralsUsed: data[3],
      hasClaimed: data[4],
      projectedHoldingsBonus: data[5],
    }
  }
  return {
    toppingsEarned: data.toppingsEarned,
    toppingsClaimed: data.toppingsClaimed,
    dailyPlays: data.dailyPlays,
    referralsUsed: data.referralsUsed,
    hasClaimed: data.hasClaimed,
    projectedHoldingsBonus: data.projectedHoldingsBonus,
  }
}

// ------------------ Hook ------------------

export function useGamePageData() {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { writeContract, isPending } = useWriteContract()
  const { signTypedDataAsync } = useSignTypedData()
  const networkId = useChainId()
  const _publicClient = useMemo(() => {
    try {
      return getPublicClient(wagmiConfig, { chainId: BASE_CHAIN_ID })
    } catch (err) {
      console.error('Failed to init public client', err)
      return null
    }
  }, [])

  const wallet = useMemo(() => ({
    address: address ?? '',
    isAuthenticated: !!isConnected,
    isLoading: address === undefined,
    error: null as Error | null,
  }), [address, isConnected])

  // ================= Dynamic PIZZA Price from DEXScreener =================
  const [pizzaUsdPrice, setPizzaUsdPrice] = useState<number>(() => getLastKnownPrice())
  const [priceOracleWorking, setPriceOracleWorking] = useState(true)

  const fetchPizzaPrice = useCallback(async () => {
    try {
      const response = await fetch('/api/price', {
        cache: 'no-store',
      })

      if (!response.ok) {
        console.warn('Price API returned non-ok status:', response.status)
        // Keep existing price on error
        return
      }

      const data = await response.json()

      if (data.success && typeof data.priceUsd === 'number' && data.priceUsd > 0) {
        setPizzaUsdPrice(data.priceUsd)
        // Save to localStorage for next session
        localStorage.setItem('pizzaUsdPrice', data.priceUsd.toString())
        setPriceOracleWorking(true)
        console.debug('✅ PIZZA price updated:', `$${data.priceUsd.toFixed(6)}`)
      } else {
        // API returned error, keep existing price
        console.warn('Price API error:', data.error)
        setPriceOracleWorking(true) // Still mark as working to not break UI
      }
    } catch (err) {
      console.error('Failed to fetch PIZZA price:', err)
      // Keep existing price on network error
      setPriceOracleWorking(true) // Still mark as working to not break UI
    }
  }, [])

  // ================= Entry Fee (Dynamic based on PIZZA price) =================
  const entryFeeWei = useMemo(() => {
    if (!pizzaUsdPrice || pizzaUsdPrice <= 0) {
      // Fallback to default if price not available
      return 100n * WEI_PER_PIZZA
    }

    // Calculate PIZZA needed for $1: 1 / price
    const pizzaPerDollar = 1 / pizzaUsdPrice

    // Convert to wei with proper rounding
    const amountWei = BigInt(Math.floor(pizzaPerDollar * Number(WEI_PER_PIZZA)))

    // Clamp to contract bounds
    // Entry is always $1 USD, but PIZZA amount varies:
    // - If PIZZA = $100: need 0.01 PIZZA (minimum)
    // - If PIZZA = $1: need 1 PIZZA
    // - If PIZZA = $0.001: need 1000 PIZZA (maximum)
    const minFee = GAME_CONSTANTS.MIN_ENTRY_FEE_WEI  // 0.01 PIZZA minimum
    const maxFee = GAME_CONSTANTS.MAX_ENTRY_FEE_WEI  // 1000 PIZZA maximum

    if (amountWei < minFee) return minFee  // Clamp up to 0.01 PIZZA minimum
    if (amountWei > maxFee) return maxFee  // Clamp down to 1000 PIZZA maximum

    return amountWei
  }, [pizzaUsdPrice])

  // ================= PIZZA Amount for Display =================
  const pizzaAmount = useMemo(() => {
    const whole = entryFeeWei / WEI_PER_PIZZA
    const fraction = entryFeeWei % WEI_PER_PIZZA
    if (fraction === 0n) return whole.toString()
    const fractionStr = fraction.toString().padStart(18, '0').replace(/0+$/, '')
    return `${whole.toString()}.${fractionStr}`
  }, [entryFeeWei])

  // ================= PIZZA Balance =================
  const [pizzaBalance, setPizzaBalance] = useState<bigint>(0n)
  const fetchPizzaBalance = useCallback(async () => {
    if (!wallet.address) return
    try {
      const balanceData = await readContract(wagmiConfig, {
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [wallet.address as `0x${string}`],
      })

      const balanceBigInt = typeof balanceData === 'bigint'
        ? balanceData
        : BigInt(String(balanceData ?? '0'))

      setPizzaBalance(balanceBigInt)
      console.debug('PIZZA balance fetched:', balanceBigInt.toString())

    } catch (err) {
      console.error('Failed to fetch PIZZA balance', err)
      setPizzaBalance(0n)
    }
  }, [wallet.address])

  // ================= Player Info =================
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null)
  const [playerWeekly, setPlayerWeekly] = useState<PlayerWeeklyInfo | null>(null)
  const [playerLifetimeStats, setPlayerLifetimeStats] = useState<PlayerLifetimeStats | null>(null)
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [hasUsedReferral, setHasUsedReferral] = useState<boolean>(true) // Default true to hide modal until we know
  const [isFirstTimePlayer, setIsFirstTimePlayer] = useState<boolean>(false) // Default false to hide modal until we confirm it's first time

  const [weekly, setWeekly] = useState<WeeklyData>({
    claimStart: 0,
    claimEnd: 0,
    totalToppings: 0n,
    claimerCount: 0,
    jackpotWei: 0n,
    projectedJackpotWei: 0n,
    projectedPlayerCount: 0,
    settled: false,
    loading: true,
    error: null,
  })
  const claimableToppings = useMemo(() => {
    if (!playerWeekly) return 0n
    // Include projectedHoldingsBonus since it's not added to toppingsEarned until claim time
    const baseEarned = playerWeekly.toppingsEarned - playerWeekly.toppingsClaimed
    const holdingsBonus = playerWeekly.hasClaimed ? 0n : playerWeekly.projectedHoldingsBonus
    const value = baseEarned + holdingsBonus
    return value > 0n ? value : 0n
  }, [playerWeekly])

  const fetchPlayerInfo = useCallback(async () => {
    if (!wallet.address) return
    try {
      // Fetch weekly info
      const weeklyInfoRaw = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerWeeklyInfo',
        args: [wallet.address as `0x${string}`],
      }) as PlayerWeeklyResponse
      const weeklyInfo = normalizeWeeklyInfo(weeklyInfoRaw)

      // ✅ FIX: Fetch lifetime stats to determine true first entry status
      const lifetimeStatsRaw = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [wallet.address as `0x${string}`],
      }) as readonly [bigint, bigint, bigint, bigint, bigint] | {
        totalDailyWins: bigint
        totalWeeklyWins: bigint
        totalPizzaWon: bigint
        lifetimeToppings: bigint
        lifetimeReferrals: bigint
      }

      // Handle both tuple and object formats
      let lifetimeToppings: bigint

      if (Array.isArray(lifetimeStatsRaw)) {
        lifetimeToppings = lifetimeStatsRaw[3]
      } else {
        lifetimeToppings = (lifetimeStatsRaw as { lifetimeToppings: bigint }).lifetimeToppings
      }

      // Check if this is the player's first time ever playing
      // lifetimeToppings = 0 means they've never entered any game before
      setIsFirstTimePlayer(lifetimeToppings === 0n)
      console.debug('Is first time player:', lifetimeToppings === 0n, 'lifetimeToppings:', lifetimeToppings)

      // ✅ Use lifetime toppings instead of weekly plays
      // This ensures isFirstEntry only triggers for truly new players
      const normalized: PlayerInfo = {
        totalToppings: weeklyInfo.toppingsEarned,
        dailyEntries: lifetimeToppings, // ✅ FIXED: Use lifetime toppings (1 per entry)
        lastEntryTime: 0n,
      }
      setPlayerInfo(normalized)
      setPlayerWeekly(weeklyInfo)

      // Referral system disabled — replaced by Share & Spin
      setHasUsedReferral(true)
      setReferralInfo({
        referralCode: '',
        referrer: '0x0000000000000000000000000000000000000000',
        totalReferrals: 0n,
        lifetimeReferrals: 0n,
        isActive: false,
      })
    } catch (err) {
      console.error('Failed to fetch player info', err)
      setPlayerInfo(null)
      setPlayerWeekly(null)
      setHasUsedReferral(true) // Default to true (hide modal) on error
      setIsFirstTimePlayer(false) // Default to false (hide modal) on error
      // Set referralInfo with empty code instead of null so UI doesn't show "Loading..."
      setReferralInfo({
        referralCode: '',
        referrer: '0x0000000000000000000000000000000000000000',
        totalReferrals: 0n,
        lifetimeReferrals: 0n,
        isActive: false,
      })
    }
  }, [wallet.address])

  // ================= Player Lifetime Stats =================
  const fetchPlayerLifetimeStats = useCallback(async () => {
    if (!wallet.address) {
      setPlayerLifetimeStats(null)
      return
    }

    try {
      const stats = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [wallet.address as `0x${string}`],
      }) as readonly [bigint, bigint, bigint, bigint, bigint] | {
        totalDailyWins: bigint
        totalWeeklyWins: bigint
        totalPizzaWon: bigint
        lifetimeToppings: bigint
        lifetimeReferrals: bigint
      }

      // Handle both tuple and object formats
      if (Array.isArray(stats)) {
        const [totalDailyWins, totalWeeklyWins, totalPizzaWon, lifetimeToppings, lifetimeReferrals] = stats
        setPlayerLifetimeStats({
          totalDailyWins,
          totalWeeklyWins,
          totalPizzaWon,
          lifetimeToppings,
          lifetimeReferrals,
        })

        console.debug('✅ Player lifetime stats fetched:', {
          totalPizzaWon: `${(Number(totalPizzaWon) / 1e18).toFixed(2)} PIZZA`,
          totalWins: (Number(totalDailyWins) + Number(totalWeeklyWins)).toString(),
        })
      } else {
        const statsObj = stats as {
          totalDailyWins: bigint
          totalWeeklyWins: bigint
          totalPizzaWon: bigint
          lifetimeToppings: bigint
          lifetimeReferrals: bigint
        }
        setPlayerLifetimeStats({
          totalDailyWins: statsObj.totalDailyWins,
          totalWeeklyWins: statsObj.totalWeeklyWins,
          totalPizzaWon: statsObj.totalPizzaWon,
          lifetimeToppings: statsObj.lifetimeToppings,
          lifetimeReferrals: statsObj.lifetimeReferrals,
        })

        console.debug('✅ Player lifetime stats fetched:', {
          totalPizzaWon: `${(Number(statsObj.totalPizzaWon) / 1e18).toFixed(2)} PIZZA`,
          totalWins: (Number(statsObj.totalDailyWins) + Number(statsObj.totalWeeklyWins)).toString(),
        })
      }
    } catch (err) {
      console.error('Failed to fetch player lifetime stats:', err)
      setPlayerLifetimeStats(null)
    }
  }, [wallet.address])

  // ================= Daily Game Data =================
  const [daily, setDaily] = useState<DailyData>({
    dailyGameId: 0,
    totalEntries: 0,
    jackpot: '0',
    isCompleted: false,
    loading: true,
    error: null,
  })
  const fetchWeekly = useCallback(async () => {
    try {
      const [weeklyData, _currentWeekId, treasuryBonusRaw, toppingUnitPizzaRaw] = await Promise.all([
        readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getCurrentWeeklyGame',
        }) as Promise<WeeklyGameResponse>,
        readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'weeklyGameId',
        }) as Promise<bigint>,
        readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'weeklyTreasuryBonus',
        }).catch(() => 0n) as Promise<bigint>, // Returns 0 if not yet deployed
        readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'toppingUnitPizza',
        }).catch(() => 1n * (10n ** 18n)) as Promise<bigint>, // Fallback to 1 PIZZA if not deployed
      ])

      const treasuryBonus = treasuryBonusRaw ?? 0n
      // toppingUnitPizza: dynamic value representing $0.10 worth of PIZZA (e.g., 15 PIZZA at $0.007/PIZZA)
      const toppingUnitPizza = toppingUnitPizzaRaw ?? (1n * (10n ** 18n))

      let claimStart: bigint
      let claimEnd: bigint
      let totalToppings: bigint
      let claimerCount: bigint
      let jackpotWei: bigint
      let settled: boolean

      if (isWeeklyGameTuple(weeklyData)) {
        // Tuple order: [claimStart, claimEnd, totalToppings, claimerCount, projectedJackpot, settled]
        ;[claimStart, claimEnd, totalToppings, claimerCount, jackpotWei, settled] = weeklyData
      } else {
        // Object with named properties
        claimStart = weeklyData.claimStart
        claimEnd = weeklyData.claimEnd
        totalToppings = weeklyData.totalToppings
        claimerCount = weeklyData.claimerCount
        jackpotWei = weeklyData.projectedJackpot
        settled = weeklyData.settled
      }
      
      // Debug log to verify we're getting the right values
      console.debug('Weekly game data:', {
        claimStart: claimStart.toString(),
        claimEnd: claimEnd.toString(),
        totalToppings: totalToppings.toString(),
        claimerCount: claimerCount.toString(),
        jackpotWei: jackpotWei.toString(),
        treasuryBonus: treasuryBonus.toString(),
        toppingUnitPizza: toppingUnitPizza.toString(),
        settled,
        isTuple: isWeeklyGameTuple(weeklyData),
      })

      let projectedJackpotWei = jackpotWei
      let projectedPlayerCount = Number(claimerCount)

      // Get unique weekly players and projected jackpot using getDailyGamePlayers
      // This is much faster than scanning event logs (~1s vs ~10s)
      try {
        const currentDailyId = await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGameId',
        }) as bigint

        // The week started after the previous weekly claimEnd (Monday noon PDT)
        // claimStart is Sunday noon PDT, so weekStart = claimStart - 6 days
        const weekStartSec = Number(claimStart) - 6 * 24 * 60 * 60

        // Fetch dailyGames info for up to 7 recent games in parallel to find which are in this week
        const gameIds: bigint[] = []
        for (let id = currentDailyId; id > 0n && id > currentDailyId - 8n; id--) {
          gameIds.push(id)
        }

        const gameInfos = await Promise.all(
          gameIds.map(id =>
            readContract(wagmiConfig, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'dailyGames',
              args: [id],
            }).then(r => ({ id, data: r as { startTime: bigint } | [bigint, ...unknown[]] }))
              .catch(() => null)
          )
        )

        // Filter to games that started after this week began
        const thisWeekGameIds: bigint[] = []
        for (const info of gameInfos) {
          if (!info) continue
          const startTime = Array.isArray(info.data) ? Number(info.data[0]) : Number(info.data.startTime)
          if (startTime >= weekStartSec) {
            thisWeekGameIds.push(info.id)
          }
        }

        // Fetch all players for this week's games in parallel
        const playerArrays = await Promise.all(
          thisWeekGameIds.map(id =>
            readContract(wagmiConfig, {
              address: PIZZA_PARTY_ADDRESS as `0x${string}`,
              abi: PIZZA_PARTY_ABI,
              functionName: 'getDailyGamePlayers',
              args: [id],
            }).then(r => r as string[])
              .catch(() => [] as string[])
          )
        )

        // Count unique players across all games this week
        const uniquePlayersThisWeek = new Set<string>()
        let totalPlays = 0
        for (const players of playerArrays) {
          for (const p of players) {
            uniquePlayersThisWeek.add(p.toLowerCase())
            totalPlays++
          }
        }

        if (uniquePlayersThisWeek.size > 0) {
          // Each daily play = 1 topping, plus streak bonuses (3 extra on 7th day)
          // Estimate toppings: totalPlays + streak bonuses for players with 7 plays
          const playCountByPlayer: Record<string, number> = {}
          for (const players of playerArrays) {
            for (const p of players) {
              const key = p.toLowerCase()
              playCountByPlayer[key] = (playCountByPlayer[key] ?? 0) + 1
            }
          }
          let estimatedToppings = BigInt(totalPlays)
          for (const count of Object.values(playCountByPlayer)) {
            if (count >= 7) estimatedToppings += 3n // streak bonus
          }

          projectedJackpotWei = estimatedToppings * toppingUnitPizza + treasuryBonus
          projectedPlayerCount = Math.max(uniquePlayersThisWeek.size, Number(claimerCount))
        }

        console.debug('Weekly projection (from getDailyGamePlayers):', {
          thisWeekGames: thisWeekGameIds.map(Number),
          totalPlays,
          uniquePlayers: uniquePlayersThisWeek.size,
          projectedPlayerCount,
        })
      } catch (projErr) {
        console.error('Failed to compute projected weekly totals', projErr)
      }

      setWeekly({
        claimStart: Number(claimStart),
        claimEnd: Number(claimEnd),
        totalToppings,
        claimerCount: Number(claimerCount),
        jackpotWei,
        projectedJackpotWei,
        projectedPlayerCount,
        settled,
        loading: false,
        error: null,
      })
    } catch (err) {
      console.error('Failed to load weekly data', err)
      setWeekly(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err : new Error('Failed to load weekly'),
      }))
    }
  }, [])

  const refreshDaily = useCallback(async () => {
    try {
      const result = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getCurrentDailyGame',
      }) as DailyGameResponse

      const dailyId = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'dailyGameId',
      })

      let playerCount: bigint
      let pot: bigint
      let settled: boolean

      // Debug: log the actual structure
      console.debug('Daily game result:', {
        isArray: Array.isArray(result),
        resultType: typeof result,
        resultKeys: !Array.isArray(result) ? Object.keys(result) : 'array',
        resultLength: Array.isArray(result) ? result.length : 'N/A',
      })

      if (isDailyGameTuple(result)) {
        // Array format: [startTime, endTime, playerCount, pot, settled]
        const [_startTime, _endTime, pc, p, s] = result
        playerCount = pc
        pot = p
        settled = Boolean(s)
        console.debug('Parsed as array:', { playerCount: playerCount.toString(), pot: pot.toString(), settled })
      } else {
        // Object format: {startTime, endTime, playerCount, pot, settled}
        playerCount = result.playerCount
        pot = result.pot
        settled = Boolean(result.settled)
        console.debug('Parsed as object:', { playerCount: playerCount.toString(), pot: pot.toString(), settled })
      }

      const jackpot = (pot / WEI_PER_PIZZA).toString()

      setDaily({
        dailyGameId: Number(dailyId),
        totalEntries: Number(playerCount),
        jackpot,
        isCompleted: settled,
        loading: false,
        error: null,
      })
    } catch (err) {
      console.error('Failed to refresh daily', err)
      setDaily(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err : new Error('Failed to load daily')
      }))
    }
  }, [])

  // ================= Countdown =================
  const [now, setNow] = useState(new Date())
  const nextResetRef = useRef(getNextPacificNoonUTC())
  useEffect(() => {
    const id = setInterval(() => {
      const current = new Date()
      setNow(current)
      if (current >= nextResetRef.current) nextResetRef.current = getNextPacificNoonUTC(current)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const msRemaining = Math.max(0, nextResetRef.current.getTime() - now.getTime())
  const { hours, minutes, seconds } = useMemo(() => {
    const totalSeconds = Math.floor(msRemaining / 1000)
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    }
  }, [msRemaining])

  const nextResetPacific = useMemo(() => toZonedTime(nextResetRef.current, PACIFIC_TZ), [])

  // ================= Flags =================
  const hasEnoughPizza = pizzaBalance >= entryFeeWei
  const [hasEnteredToday, setHasEnteredToday] = useState(false)
  // With permit, we don't need to track approval separately - it happens in one tx!

  // ================= Pending Slice State =================
  const [hasPendingSlice, setHasPendingSlice] = useState(false)
  const [_pendingSliceSponsor, setPendingSliceSponsor] = useState<`0x${string}` | null>(null)
  const [pendingSliceSponsorName, setPendingSliceSponsorName] = useState<string | null>(null)
  const [isClaimingSlice, setIsClaimingSlice] = useState(false)

  // ================= Check entry status =================
  const checkStatus = useCallback(async () => {
    if (!wallet.address) return
    try {
      // Check if already entered today
      const entered = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'hasPlayedDailyGame',
        args: [wallet.address as `0x${string}`],
      })
      const hasEntered = Boolean(entered)
      setHasEnteredToday(hasEntered)

      // Check for pending slice (free entry from parlor owner)
      try {
        const pendingSliceResult = await readContract(wagmiConfig, {
          address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
          abi: PARLOR_MANAGER_ABI,
          functionName: 'hasPendingSlice',
          args: [wallet.address as `0x${string}`],
        })

        // Handle wagmi return format (array or object)
        let hasPending = false
        let sponsor: `0x${string}` = '0x0000000000000000000000000000000000000000'

        if (Array.isArray(pendingSliceResult)) {
          [hasPending, sponsor] = pendingSliceResult as [boolean, `0x${string}`]
        } else if (pendingSliceResult && typeof pendingSliceResult === 'object') {
          const result = pendingSliceResult as { hasPending?: boolean; sponsor?: `0x${string}`; 0?: boolean; 1?: `0x${string}` }
          hasPending = result.hasPending ?? result[0] ?? false
          sponsor = result.sponsor ?? result[1] ?? '0x0000000000000000000000000000000000000000'
        }

        if (hasPending && sponsor !== '0x0000000000000000000000000000000000000000') {
          setHasPendingSlice(true)
          setPendingSliceSponsor(sponsor)

          // Try to get sponsor's franchise name
          try {
            const franchiseName = await readContract(wagmiConfig, {
              address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
              abi: PARLOR_MANAGER_ABI,
              functionName: 'parlorName',
              args: [sponsor],
            }) as string
            if (franchiseName && franchiseName.length > 0) {
              setPendingSliceSponsorName(franchiseName)
            }
          } catch {
            // Ignore errors fetching franchise name
          }
        } else {
          setHasPendingSlice(false)
          setPendingSliceSponsor(null)
          setPendingSliceSponsorName(null)
        }
      } catch (err) {
        console.error('Failed to check pending slice:', err)
        setHasPendingSlice(false)
      }

      console.debug('Entry status:', {
        hasEnteredToday: hasEntered,
      })

    } catch (err) {
      console.error('Failed to check status', err)
      setHasEnteredToday(false)
    }
  }, [wallet.address])

  // ================= Watch blockchain =================
  useEffect(() => {
    let unwatch: (() => void) | null = null
    void fetchPizzaBalance()
    void refreshDaily()
    void checkStatus()
    void fetchPlayerInfo()
    void fetchWeekly()
    void fetchPlayerLifetimeStats()
    void fetchPizzaPrice()

    unwatch = watchBlockNumber(wagmiConfig, {
      onBlockNumber: () => {
        void fetchPizzaBalance()
        void refreshDaily()
        void checkStatus()
        void fetchPlayerInfo()
        void fetchWeekly()
        void fetchPlayerLifetimeStats()
        void fetchPizzaPrice()
      },
      onError: () => {},
    })
    return () => { if (unwatch) unwatch() }
  }, [fetchPizzaBalance, refreshDaily, checkStatus, fetchPlayerInfo, fetchWeekly, fetchPlayerLifetimeStats, fetchPizzaPrice])

  // ================= Periodic Price Refresh =================
  useEffect(() => {
    // Fetch price immediately on mount
    void fetchPizzaPrice()

    // Then refresh every 30 seconds to keep price current
    const priceInterval = setInterval(() => {
      void fetchPizzaPrice()
    }, 30000)

    return () => clearInterval(priceInterval)
  }, [fetchPizzaPrice])

  // ================= Reset-detection (new Pacific day) =================
  const prevMsRef = useRef<number | null>(null)
  useEffect(() => {
    if (prevMsRef.current === null) {
      prevMsRef.current = msRemaining
      return
    }
    if (prevMsRef.current > 0 && msRemaining === 0) {
      setHasEnteredToday(false)
      setTimeout(() => {
        void refreshDaily()
        void checkStatus()
        void fetchPizzaBalance()
        void fetchPlayerInfo()
      }, 500)
    }
    prevMsRef.current = msRemaining
  }, [msRemaining, refreshDaily, checkStatus, fetchPizzaBalance, fetchPlayerInfo])

  // ================= Write Functions =================
  // No separate approval needed - we use EIP-2612 permit for single-tx entry!

  const handleClaimToppings = useCallback(async (): Promise<boolean> => {
    if (networkId !== BASE_CHAIN_ID) {
      alert(`Please switch to Base network (Chain ID: ${BASE_CHAIN_ID})`)
      return false
    }
    if (!wallet.isAuthenticated) {
      alert('Please connect your wallet first')
      return false
    }
    try {
      await writeContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'claimToppings',
      })
      setTimeout(() => {
        void fetchPlayerInfo()
        void fetchWeekly()
      }, 2500)
      return true
    } catch (err) {
      console.error('❌ Claim toppings failed:', err)
      const message = getErrorMessage(err) || 'Unknown error'
      alert(`Failed to claim toppings: ${message}`)
      return false
    }
  }, [networkId, wallet.isAuthenticated, writeContract, fetchPlayerInfo, fetchWeekly])

  // ================= Claim Free Slice =================
  const handleClaimFreeSlice = useCallback(async () => {
    console.log('=== CLAIM FREE SLICE CLICKED ===')

    if (networkId !== BASE_CHAIN_ID) {
      console.error('Wrong network. Current:', networkId, 'Expected:', BASE_CHAIN_ID)
      alert(`Please switch to Base network (Chain ID: ${BASE_CHAIN_ID})`)
      return
    }

    if (!wallet.isAuthenticated || !wallet.address) {
      console.error('Wallet not authenticated')
      alert('Please connect your wallet first')
      return
    }

    if (!hasPendingSlice || !_pendingSliceSponsor) {
      console.error('No pending slice to claim')
      alert('No free slice available to claim')
      return
    }

    if (hasEnteredToday) {
      console.error('Already entered today')
      alert('You have already entered the game today.')
      return
    }

    try {
      setIsClaimingSlice(true)

      // LAYER 2: Verify claim is legitimate (claimer FID != sender FID)
      // Also tracks behavioral patterns for Layer 3
      try {
        // Look up claimer's FID from their address
        const claimerFidRes = await fetch(
          `/api/users/check-ownership?address=${encodeURIComponent(wallet.address)}`
        )
        const claimerFidData = await claimerFidRes.json()
        const claimerFid = claimerFidData.ownerFid || 0

        // Verify the claim
        const verifyRes = await fetch('/api/slice/verify-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimerAddress: wallet.address,
            claimerFid,
            senderAddress: _pendingSliceSponsor,
            dailyGameId: daily.dailyGameId.toString(),
          }),
        })
        const verifyData = await verifyRes.json()

        if (verifyData.blocked) {
          alert(verifyData.reason || 'This slice cannot be claimed.')
          setIsClaimingSlice(false)
          return
        }
      } catch (verifyErr) {
        // On verification error, log but allow claim to proceed
        // (don't break the game for users due to API issues)
        console.error('Slice verification failed:', verifyErr)
      }

      // Calculate $1 worth of PIZZA for the entry fee (treasury pays)
      const pizzaPerDollar = 1 / pizzaUsdPrice
      const entryFeeAmount = BigInt(Math.floor(pizzaPerDollar * 1e18))

      console.log('Claiming free slice with entry fee:', (Number(entryFeeAmount) / 1e18).toFixed(4), 'PIZZA')

      const claimRes = await fetch('/api/slice/claim-backend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerAddress: address, entryFeeAmount: entryFeeAmount.toString() }),
      })
      const claimData = await claimRes.json()
      if (!claimData.success) throw new Error(claimData.error || 'Claim failed')

      console.log('✅ Free slice claimed successfully!')
      setHasEnteredToday(true)
      setHasPendingSlice(false)
      setPendingSliceSponsor(null)
      setPendingSliceSponsorName(null)

      // Refresh all data
      void fetchPlayerInfo()
      void refreshDaily()
      void fetchWeekly()
      void fetchPizzaBalance()
      void fetchPlayerLifetimeStats()

    } catch (err: unknown) {
      console.error('❌ Free slice claim failed:', err)
      setIsClaimingSlice(false)

      const message = getErrorMessage(err) || 'Unknown error'
      alert(`Failed to claim free slice: ${message}`)
    } finally {
      setIsClaimingSlice(false)
    }
  }, [networkId, wallet.isAuthenticated, wallet.address, hasPendingSlice, _pendingSliceSponsor, hasEnteredToday, pizzaUsdPrice, daily.dailyGameId, writeContract, fetchPlayerInfo, refreshDaily, fetchWeekly, fetchPizzaBalance, fetchPlayerLifetimeStats])

  const handleEnterGame = useCallback(async (_referralCode?: string) => {
    console.log('=== ENTER GAME WITH PERMIT CLICKED ===')

    if (networkId !== BASE_CHAIN_ID) {
      console.error('Wrong network. Current:', networkId, 'Expected:', BASE_CHAIN_ID)
      alert(`Please switch to Base network (Chain ID: ${BASE_CHAIN_ID})`)
      return
    }

    if (!wallet.isAuthenticated || !wallet.address) {
      console.error('Wallet not authenticated')
      alert('Please connect your wallet first')
      return
    }

    // Pre-flight checks
    console.log('=== DAILY ENTRY TRANSACTION DEBUG ===')
    console.log('Wallet address:', wallet.address)
    console.log('PIZZA Balance (raw wei):', pizzaBalance.toString())
    console.log('Entry Fee (raw wei):', entryFeeWei.toString())
    console.log('Has Enough PIZZA:', hasEnoughPizza)
    console.log('Has Entered Today:', hasEnteredToday)
    console.log('=====================================')

    if (!hasEnoughPizza) {
      alert(`You need at least ${(Number(entryFeeWei) / 1e18).toFixed(2)} PIZZA to play. You have ${(Number(pizzaBalance) / 1e18).toFixed(2)} PIZZA.`)
      return
    }

    if (hasEnteredToday) {
      alert('You have already entered the game today.')
      return
    }

    // ============================================================
    // CRITICAL: Save "before" snapshot for accurate win tracking
    // ============================================================
    try {
      const beforeStats = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerLifetimeStats',
        args: [wallet.address as `0x${string}`],
      }) as readonly [bigint, bigint, bigint, bigint, bigint] | {
        totalDailyWins: bigint
        totalWeeklyWins: bigint
        totalPizzaWon: bigint
        lifetimeToppings: bigint
        lifetimeReferrals: bigint
      }

      const currentGameId = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'dailyGameId',
      }) as bigint

      // Handle both tuple and object formats
      const beforePizzaWon = Array.isArray(beforeStats)
        ? beforeStats[2]
        : (beforeStats as { totalPizzaWon: bigint }).totalPizzaWon

      const beforeKey = `pizza_party_before_game_${currentGameId}`
      if (typeof window !== 'undefined') {
        localStorage.setItem(beforeKey, beforePizzaWon.toString())
      }

      console.debug('💾 Saved before snapshot:', {
        gameId: currentGameId.toString(),
        pizzaBefore: (Number(beforePizzaWon) / 1e18).toFixed(2),
      })
    } catch (snapshotErr) {
      console.warn('Failed to save before snapshot:', snapshotErr)
      // Continue anyway - fallback to calculation
    }
    // ============================================================

    // ============================================================
    // ENTRY FLOW: Try permit first, fallback to approve+enter
    // ============================================================

    // Helper function to do traditional approve+enter (2 transactions)
    const doApproveAndEnter = async () => {
      console.log('=== FALLBACK: APPROVE + ENTER (2 transactions) ===')

      // Check current allowance
      const currentAllowance = await readContract(wagmiConfig, {
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'allowance',
        args: [wallet.address as `0x${string}`, PIZZA_PARTY_ADDRESS as `0x${string}`],
      }) as bigint

      console.log('Current allowance:', currentAllowance.toString())
      console.log('Required:', entryFeeWei.toString())

      // Step 1: Approve if needed
      if (currentAllowance < entryFeeWei) {
        console.log('=== STEP 1: APPROVE ===')
        await writeContract({
          address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
          abi: PIZZA_TOKEN_ABI,
          functionName: 'approve',
          args: [PIZZA_PARTY_ADDRESS as `0x${string}`, entryFeeWei],
        })
        console.log('Approval transaction sent, waiting 3 seconds...')
        // Wait a bit for approval to confirm
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      // Step 2: Enter game
      console.log('=== STEP 2: ENTER GAME ===')
      const result = await writeContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'enterDailyGame',
        args: [entryFeeWei, ''],
      })

      return result
    }

    try {
      // Try EIP-2612 permit flow first (single transaction)
      console.log('=== ATTEMPTING PERMIT FLOW ===')

      // 1. Get current nonce from PIZZA token
      const nonce = await readContract(wagmiConfig, {
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'nonces',
        args: [wallet.address as `0x${string}`],
      }) as bigint

      // 2. Set deadline to 20 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)

      console.log('=== PERMIT SIGNING ===')
      console.log('Nonce:', nonce.toString())
      console.log('Deadline:', deadline.toString())
      console.log('Amount:', entryFeeWei.toString())

      // 3. Sign EIP-712 typed data for permit (using wagmi hook for proper connector handling)
      let signature: string
      try {
        signature = await signTypedDataAsync({
          domain: {
            name: GAME_CONSTANTS.PERMIT_DOMAIN.name,
            version: GAME_CONSTANTS.PERMIT_DOMAIN.version,
            chainId: GAME_CONSTANTS.PERMIT_DOMAIN.chainId,
            verifyingContract: PIZZA_TOKEN_ADDRESS as `0x${string}`,
          },
          types: {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          message: {
            owner: wallet.address as `0x${string}`,
            spender: PIZZA_PARTY_ADDRESS as `0x${string}`,
            value: entryFeeWei,
            nonce,
            deadline,
          },
        })
      } catch (signErr) {
        // Signature failed - wallet may not support EIP-712 properly
        console.warn('Permit signature failed, falling back to approve+enter:', signErr)
        await doApproveAndEnter()
        console.log('✅ Entry successful via approve+enter fallback')
        setHasEnteredToday(true)
        setTimeout(() => {
          void checkStatus()
          void fetchPlayerInfo()
          void refreshDaily()
          void fetchPizzaBalance()
          void fetchWeekly()
          void fetchPlayerLifetimeStats()
        }, 3000)
        return
      }

      // 4. Split signature into v, r, s
      const r = `0x${signature.slice(2, 66)}` as `0x${string}`
      const s = `0x${signature.slice(66, 130)}` as `0x${string}`
      const v = parseInt(signature.slice(130, 132), 16)

      console.log('=== PERMIT SIGNATURE ===')
      console.log('v:', v)
      console.log('r:', r)
      console.log('s:', s)

      // 5. Call enterDailyGameWithPermit - single transaction!
      // Contract signature: enterDailyGameWithPermit(uint256 amountPaid, string referralCode, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
      console.log('=== CALLING enterDailyGameWithPermit ===')
      console.log('Referral code being passed: (disabled)')

      try {
        const result = await writeContract({
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'enterDailyGameWithPermit',
          args: [entryFeeWei, '', deadline, v, r, s],
        })
        console.log('✅ Transaction sent successfully:', result)
      } catch (permitTxErr) {
        // Permit transaction failed - try approve+enter fallback
        console.warn('Permit transaction failed, falling back to approve+enter:', permitTxErr)
        await doApproveAndEnter()
        console.log('✅ Entry successful via approve+enter fallback')
      }

      setHasEnteredToday(true)

      // Refresh data after a short delay
      setTimeout(() => {
        void checkStatus()
        void fetchPlayerInfo()
        void refreshDaily()
        void fetchPizzaBalance()
        void fetchWeekly()
        void fetchPlayerLifetimeStats()
      }, 3000)

    } catch (err: unknown) {
      console.error('❌ Transaction failed:', err)

      // Reset hasEnteredToday if transaction failed
      setHasEnteredToday(false)

      // Parse the error for a better message
      const error = err as Record<string, unknown>
      let message = 'Transaction failed'

      if (error?.message && typeof error.message === 'string') {
        const msg = error.message.toLowerCase()

        if (msg.includes('insufficient funds') || msg.includes('insufficient balance')) {
          message = 'Insufficient ETH for gas fees. Please add some ETH to your Base wallet.'
        } else if (msg.includes('user rejected') || msg.includes('user denied')) {
          message = 'Transaction was cancelled.'
        } else if (msg.includes('already') || msg.includes('played')) {
          message = 'You have already played today.'
        } else if (msg.includes('game ended') || msg.includes('game settled')) {
          message = 'Game has ended. Please wait for the next game.'
        } else if (msg.includes('weekly limit')) {
          message = 'You have reached the weekly play limit (7 entries/week).'
        } else if (msg.includes('permit') || msg.includes('signature')) {
          message = 'Signature failed. Please try again.'
        } else {
          message = error.message
        }
      } else if (error?.shortMessage && typeof error.shortMessage === 'string') {
        const msg = error.shortMessage.toLowerCase()
        if (msg.includes('insufficient funds') || msg.includes('insufficient balance')) {
          message = 'Insufficient ETH for gas fees. Please add some ETH to your Base wallet.'
        } else {
          message = error.shortMessage
        }
      }

      alert(message)
    }
  }, [wallet.isAuthenticated, wallet.address, writeContract, signTypedDataAsync, networkId, checkStatus, fetchPlayerInfo, refreshDaily, fetchPizzaBalance, fetchWeekly, pizzaBalance, entryFeeWei, hasEnoughPizza, hasEnteredToday, fetchPlayerLifetimeStats, playerInfo])

  const openWalletModal = useCallback(() => open(), [open])

  useEffect(() => {
    console.debug('pizzaBalance, entryFeeWei, hasEnoughPizza', pizzaBalance.toString(), entryFeeWei.toString(), hasEnoughPizza)
  }, [pizzaBalance, entryFeeWei, hasEnoughPizza])

  return {
    wallet,
    openWalletModal,
    // Token price and amount
    pizzaUsd: pizzaUsdPrice,        // PIZZA price in USD
    pizzaAmount: pizzaAmount,       // PIZZA amount for entry fee display
    pizzaWei: entryFeeWei,          // Entry fee in wei
    pizzaBalance: pizzaBalance,     // User's PIZZA balance
    daily,
    playerInfo,
    playerWeekly,
    playerLifetimeStats,
    weekly,
    referralInfo,
    priceOracleWorking,
    pacificCountdown: { msRemaining, hours, minutes, seconds, nextResetPacific },
    hasEnoughPizza: hasEnoughPizza, // Has enough PIZZA to play
    isEntryInProgress: isPending,
    handleEnterGame,
    handleClaimToppings,
    hasEnteredToday,
    claimableToppings,
    hasUsedReferral, // Whether player has already used a referral code (can only use once)
    isFirstTimePlayer, // Whether player has never played before (lifetimeToppings = 0)
    // Free slice (pending slice from parlor owner)
    hasPendingSlice,
    pendingSliceSponsorName,
    handleClaimFreeSlice,
    isClaimingSlice,
  }
}
