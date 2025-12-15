'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { parseAbiItem, maxUint256 } from 'viem'
import { readContract, watchBlockNumber, getPublicClient } from '@wagmi/core'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import {
  GAME_CONSTANTS,
  PIZZA_PARTY_ADDRESS,
  PIZZA_PARTY_ABI,
  VMF_TOKEN_ADDRESS,
  VMF_TOKEN_ABI,
} from './constants'
import { wagmiConfig } from '../components/config/wagmiConfig'

const PACIFIC_TZ = 'America/Los_Angeles'
const BASE_CHAIN_ID = 8453
const WEI_PER_VMF = 10n ** 18n
const DEFAULT_VMF_USD_PRICE = 0.01
const TOPPINGS_EARNED_EVENT = parseAbiItem(
  'event ToppingsEarned(uint256 indexed weekId, address indexed player, uint256 amount, string reason)',
)

// Old contract for migration - query ToppingsEarned events from Monday 12pm PST
// This is needed because we deployed a new contract mid-week (Weekly 3)
const _OLD_PIZZA_PARTY_ADDRESS = '0x5c3aaD450F0014292Ff363b2147e6571b16c8035'
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
  totalVmfWon: bigint
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
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
  const networkId = useChainId()
  const publicClient = useMemo(() => {
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

  // ================= Dynamic VMF Price from DEXScreener =================
  const [vmfUsdPrice, setVmfUsdPrice] = useState<number>(DEFAULT_VMF_USD_PRICE)
  const [priceOracleWorking, setPriceOracleWorking] = useState(true)

  const fetchVmfPrice = useCallback(async () => {
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
        setVmfUsdPrice(data.priceUsd)
        setPriceOracleWorking(true)
        console.debug('✅ VMF price updated:', `$${data.priceUsd.toFixed(6)}`)
      } else {
        // API returned error, keep existing price
        console.warn('Price API error:', data.error)
        setPriceOracleWorking(true) // Still mark as working to not break UI
      }
    } catch (err) {
      console.error('Failed to fetch VMF price:', err)
      // Keep existing price on network error
      setPriceOracleWorking(true) // Still mark as working to not break UI
    }
  }, [])

  // ================= Entry Fee (Dynamic based on VMF price) =================
  const entryFeeWei = useMemo(() => {
    if (!vmfUsdPrice || vmfUsdPrice <= 0) {
      // Fallback to default if price not available
      return 100n * WEI_PER_VMF
    }
    
    // Calculate VMF needed for $1: 1 / price
    const vmfPerDollar = 1 / vmfUsdPrice
    
    // Convert to wei with proper rounding
    const amountWei = BigInt(Math.floor(vmfPerDollar * Number(WEI_PER_VMF)))
    
    // Clamp to contract bounds
    // Entry is always $1 USD, but VMF amount varies:
    // - If VMF = $100: need 0.01 VMF (minimum)
    // - If VMF = $1: need 1 VMF
    // - If VMF = $0.001: need 1000 VMF (maximum)
    const minFee = GAME_CONSTANTS.MIN_ENTRY_FEE_WEI  // 0.01 VMF minimum
    const maxFee = GAME_CONSTANTS.MAX_ENTRY_FEE_WEI  // 1000 VMF maximum
    
    if (amountWei < minFee) return minFee  // Clamp up to 0.01 VMF minimum
    if (amountWei > maxFee) return maxFee  // Clamp down to 1000 VMF maximum
    
    return amountWei
  }, [vmfUsdPrice])

  // ================= VMF Amount for Display =================
  const vmfAmount = useMemo(() => {
    const whole = entryFeeWei / WEI_PER_VMF
    const fraction = entryFeeWei % WEI_PER_VMF
    if (fraction === 0n) return whole.toString()
    const fractionStr = fraction.toString().padStart(18, '0').replace(/0+$/, '')
    return `${whole.toString()}.${fractionStr}`
  }, [entryFeeWei])

  // ================= VMF Balance =================
  const [vmfBalance, setVmfBalance] = useState<bigint>(0n)
  const fetchVmfBalance = useCallback(async () => {
    if (!wallet.address) return
    try {
      const balanceData = await readContract(wagmiConfig, {
        address: VMF_TOKEN_ADDRESS as `0x${string}`,
        abi: VMF_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [wallet.address as `0x${string}`],
      })

      const balanceBigInt = typeof balanceData === 'bigint'
        ? balanceData
        : BigInt(String(balanceData ?? '0'))

      setVmfBalance(balanceBigInt)
      console.debug('VMF balance fetched:', balanceBigInt.toString())

    } catch (err) {
      console.error('Failed to fetch VMF balance', err)
      // Keep previous balance on error - don't reset to 0
      // This prevents flickering when RPC calls fail temporarily
    }
  }, [wallet.address])

  // ================= Player Info =================
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null)
  const [playerWeekly, setPlayerWeekly] = useState<PlayerWeeklyInfo | null>(null)
  const [playerLifetimeStats, setPlayerLifetimeStats] = useState<PlayerLifetimeStats | null>(null)
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)

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
    const value = playerWeekly.toppingsEarned - playerWeekly.toppingsClaimed
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
        totalVmfWon: bigint
        lifetimeToppings: bigint
        lifetimeReferrals: bigint
      }

      // Handle both tuple and object formats
      let lifetimeToppings: bigint
      let lifetimeReferrals: bigint
      
      if (Array.isArray(lifetimeStatsRaw)) {
        lifetimeToppings = lifetimeStatsRaw[3]
        lifetimeReferrals = lifetimeStatsRaw[4]
      } else {
        const statsObj = lifetimeStatsRaw as {
          totalDailyWins: bigint
          totalWeeklyWins: bigint
          totalVmfWon: bigint
          lifetimeToppings: bigint
          lifetimeReferrals: bigint
        }
        lifetimeToppings = statsObj.lifetimeToppings
        lifetimeReferrals = statsObj.lifetimeReferrals
      }

      // ✅ Use lifetime toppings instead of weekly plays
      // This ensures isFirstEntry only triggers for truly new players
      const normalized: PlayerInfo = {
        totalToppings: weeklyInfo.toppingsEarned,
        dailyEntries: lifetimeToppings, // ✅ FIXED: Use lifetime toppings (1 per entry)
        lastEntryTime: 0n,
      }
      setPlayerInfo(normalized)
      setPlayerWeekly(weeklyInfo)

      let referralCode = ''
      try {
        const codeResult = await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getReferralCode',
          args: [wallet.address as `0x${string}`],
        })
        referralCode = typeof codeResult === 'string' ? codeResult : ''
        console.debug('Referral code fetched:', referralCode || '(empty)')
      } catch (codeErr) {
        console.error('Failed to fetch referral code:', codeErr)
        // Continue with empty string - code might not exist yet on old contract
        referralCode = ''
      }

      const refInfo: ReferralInfo = {
        referralCode: referralCode || '', // Keep empty string - UI will handle display
        referrer: '0x0000000000000000000000000000000000000000',
        totalReferrals: weeklyInfo.referralsUsed,
        lifetimeReferrals: lifetimeReferrals, // ✅ Use actual lifetime referrals
        isActive: referralCode.length > 0,
      }
      setReferralInfo(refInfo)
    } catch (err) {
      console.error('Failed to fetch player info', err)
      // Keep previous values on error - don't reset to prevent flickering
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
        totalVmfWon: bigint
        lifetimeToppings: bigint
        lifetimeReferrals: bigint
      }

      // Handle both tuple and object formats
      if (Array.isArray(stats)) {
        const [totalDailyWins, totalWeeklyWins, totalVmfWon, lifetimeToppings, lifetimeReferrals] = stats
        setPlayerLifetimeStats({
          totalDailyWins,
          totalWeeklyWins,
          totalVmfWon,
          lifetimeToppings,
          lifetimeReferrals,
        })
        
        console.debug('✅ Player lifetime stats fetched:', {
          totalVmfWon: `${(Number(totalVmfWon) / 1e18).toFixed(2)} VMF`,
          totalWins: (Number(totalDailyWins) + Number(totalWeeklyWins)).toString(),
        })
      } else {
        const statsObj = stats as {
          totalDailyWins: bigint
          totalWeeklyWins: bigint
          totalVmfWon: bigint
          lifetimeToppings: bigint
          lifetimeReferrals: bigint
        }
        setPlayerLifetimeStats({
          totalDailyWins: statsObj.totalDailyWins,
          totalWeeklyWins: statsObj.totalWeeklyWins,
          totalVmfWon: statsObj.totalVmfWon,
          lifetimeToppings: statsObj.lifetimeToppings,
          lifetimeReferrals: statsObj.lifetimeReferrals,
        })
        
        console.debug('✅ Player lifetime stats fetched:', {
          totalVmfWon: `${(Number(statsObj.totalVmfWon) / 1e18).toFixed(2)} VMF`,
          totalWins: (Number(statsObj.totalDailyWins) + Number(statsObj.totalWeeklyWins)).toString(),
        })
      }
    } catch (err) {
      console.error('Failed to fetch player lifetime stats:', err)
      // Keep previous values on error - don't reset to prevent flickering
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
      const [weeklyData, currentWeekId] = await Promise.all([
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
      ])

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
        settled,
        isTuple: isWeeklyGameTuple(weeklyData),
      })

      let projectedJackpotWei = jackpotWei
      let projectedPlayerCount = Number(claimerCount)

      if (publicClient) {
        try {
          // Count from ToppingsEarned events for the current week
          // Query from genesis to ensure no events are missed (weekId filter ensures only current week)
          const fromBlock = 0n

          // Query NEW contract for current week's toppings
          const toppingsLogs = await publicClient.getLogs({
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            event: TOPPINGS_EARNED_EVENT,
            args: { weekId: currentWeekId },
            fromBlock,
          })

          // MIGRATION NOTE: Old contract (0x5c3aaD450F0014292Ff363b2147e6571b16c8035) was used for Weekly 3.
          // Weekly 3 has now been settled via emergencySettleWeekly. We are now on Weekly 4.
          // The old contract events should NO LONGER be queried for the current week's jackpot.
          // Weekly 4+ only uses the new contract at PIZZA_PARTY_ADDRESS.
          const oldContractLogs: typeof toppingsLogs = []

          let totalEarned = 0n
          const uniquePlayersThisWeek = new Set<string>()

          // Debug: Track breakdown by reason
          const toppingsByReason: Record<string, bigint> = {}
          const playersByReason: Record<string, Set<string>> = {}

          // Process logs from BOTH contracts
          const allLogs = [...oldContractLogs, ...toppingsLogs]

          for (const log of allLogs) {
            const amount = log.args?.amount ?? 0n
            const playerArg = log.args?.player
            const reason = (log.args as { reason?: string })?.reason ?? 'unknown'

            totalEarned += amount

            // Track by reason for debugging
            toppingsByReason[reason] = (toppingsByReason[reason] ?? 0n) + amount
            if (!playersByReason[reason]) {
              playersByReason[reason] = new Set()
            }

            // Track unique players who earned any toppings this week
            if (playerArg) {
              uniquePlayersThisWeek.add(playerArg.toLowerCase())
              playersByReason[reason].add(playerArg.toLowerCase())
            }
          }

          // Log detailed breakdown
          console.log('=== WEEKLY JACKPOT DEBUG ===')
          console.log('Old contract events (since Monday):', oldContractLogs.length)
          console.log('New contract events:', toppingsLogs.length)
          console.log('Total ToppingsEarned events:', allLogs.length)
          console.log('Unique players (all reasons):', uniquePlayersThisWeek.size)
          console.log('Total toppings earned:', totalEarned.toString())
          console.log('Projected jackpot:', (Number(totalEarned) * 10).toString(), 'VMF')
          console.log('')
          console.log('Breakdown by reason:')
          for (const [reason, amount] of Object.entries(toppingsByReason)) {
            const players = playersByReason[reason]
            console.log(`  ${reason}: ${amount.toString()} toppings from ${players?.size ?? 0} unique players`)
            if (players && players.size <= 10) {
              console.log(`    Players: ${Array.from(players).join(', ')}`)
            }
          }
          console.log('')
          console.log('All unique player addresses:')
          for (const addr of uniquePlayersThisWeek) {
            console.log(`  ${addr}`)
          }
          console.log('=== END DEBUG ===')

          console.debug('Weekly projection (from events):', {
            toppingsEarnedEvents: allLogs.length,
            oldContractEvents: oldContractLogs.length,
            newContractEvents: toppingsLogs.length,
            uniquePlayersFromEvents: uniquePlayersThisWeek.size,
            currentWeekId: currentWeekId.toString(),
            totalEarnedToppings: totalEarned.toString(),
            claimerCount: claimerCount.toString(),
          })

          // Use ToppingsEarned as source of truth
          if (totalEarned > 0n) {
            // Jackpot = total toppings earned this week × 10 VMF per topping
            // IMPORTANT: Toppings are added to weekly jackpot IMMEDIATELY when earned (daily plays, referrals)
            // The only exception is holdings bonus (3 toppings per $10 of VMF) which is calculated
            // at claim time based on VMF balance snapshot at that moment
            // This projection shows what the jackpot will be if all earned toppings are claimed
            projectedJackpotWei = totalEarned * GAME_CONSTANTS.TOPPING_TO_VMF_RATE
            // Weekly Players = unique players only (one player counts as 1, regardless of how many times they played)
            projectedPlayerCount = Math.max(uniquePlayersThisWeek.size, Number(claimerCount))

          }

          console.debug('Weekly projection (after processing):', {
            projectedPlayerCount: projectedPlayerCount,
            projectedJackpotWei: projectedJackpotWei.toString(),
          })
        } catch (projErr) {
          console.error('Failed to compute projected weekly totals', projErr)
        }
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
  }, [publicClient])

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

      const jackpot = (pot / WEI_PER_VMF).toString()

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
  const hasEnoughVMF = vmfBalance >= entryFeeWei
  const [hasEnteredToday, setHasEnteredToday] = useState(false)
  const [needsApproval, setNeedsApproval] = useState(false)

  // ================= Check allowance & entry =================
  const checkStatus = useCallback(async () => {
    if (!wallet.address) return
    try {
      // Check allowance
      const allowance = await readContract(wagmiConfig, {
        address: VMF_TOKEN_ADDRESS as `0x${string}`,
        abi: VMF_TOKEN_ABI,
        functionName: 'allowance',
        args: [wallet.address as `0x${string}`, PIZZA_PARTY_ADDRESS as `0x${string}`],
      })
      const allowanceBigInt = typeof allowance === 'bigint'
        ? allowance
        : BigInt(String(allowance ?? '0'))

      const needsApprovalValue = allowanceBigInt < entryFeeWei
      setNeedsApproval(needsApprovalValue)
      
      console.debug('Approval status:', {
        allowance: allowanceBigInt.toString(),
        entryFee: entryFeeWei.toString(),
        needsApproval: needsApprovalValue,
      })

      // Check if already entered today
      const entered = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'hasPlayedDailyGame',
        args: [wallet.address as `0x${string}`],
      })
      const hasEntered = Boolean(entered)
      setHasEnteredToday(hasEntered)
      
      console.debug('Entry status:', {
        hasEnteredToday: hasEntered,
      })

    } catch (err) {
      console.error('Failed to check status', err)
      // Keep previous values on error - don't reset to prevent flickering
    }
  }, [wallet.address, entryFeeWei])

  // ================= Watch blockchain =================
  // Track last block to prevent duplicate updates
  const lastBlockRef = useRef<bigint>(0n)

  useEffect(() => {
    let unwatch: (() => void) | null = null

    // Initial fetch on mount
    void fetchVmfBalance()
    void refreshDaily()
    void checkStatus()
    void fetchPlayerInfo()
    void fetchWeekly()
    void fetchPlayerLifetimeStats()
    void fetchVmfPrice()

    // Only refresh on block changes, debounced to every 5 blocks (~10 seconds)
    unwatch = watchBlockNumber(wagmiConfig, {
      onBlockNumber: (blockNumber) => {
        // Only refresh every 5 blocks to reduce flickering
        if (blockNumber - lastBlockRef.current < 5n) return
        lastBlockRef.current = blockNumber

        void fetchVmfBalance()
        void refreshDaily()
        void checkStatus()
        void fetchPlayerInfo()
        void fetchWeekly()
        void fetchPlayerLifetimeStats()
        // Don't fetch price on every block - it has its own interval
      },
      onError: () => {},
    })
    return () => { if (unwatch) unwatch() }
  }, [fetchVmfBalance, refreshDaily, checkStatus, fetchPlayerInfo, fetchWeekly, fetchPlayerLifetimeStats, fetchVmfPrice])

  // ================= Periodic Price Refresh =================
  useEffect(() => {
    // Fetch price immediately on mount
    void fetchVmfPrice()

    // Then refresh every 30 seconds to keep price current
    const priceInterval = setInterval(() => {
      void fetchVmfPrice()
    }, 30000)

    return () => clearInterval(priceInterval)
  }, [fetchVmfPrice])

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
        void fetchVmfBalance()
        void fetchPlayerInfo()
      }, 500)
    }
    prevMsRef.current = msRemaining
  }, [msRemaining, refreshDaily, checkStatus, fetchVmfBalance, fetchPlayerInfo])

  // ================= Write Functions =================
  const handleApproveVMF = useCallback(async () => {
    if (networkId !== BASE_CHAIN_ID || !wallet.isAuthenticated) {
      console.error('Wrong network or not authenticated')
      return
    }
    
    try {
      console.log('Approving VMF for PizzaParty contract...')
      await writeContract({
        address: VMF_TOKEN_ADDRESS as `0x${string}`,
        abi: VMF_TOKEN_ABI,
        functionName: 'approve',
        args: [PIZZA_PARTY_ADDRESS as `0x${string}`, maxUint256],
      })
      
      console.log('✅ Approval transaction submitted')
      
      // Wait a bit then check status
      setTimeout(() => {
        void checkStatus()
      }, 2000)
      
    } catch (err: unknown) {
      console.error('❌ Approve failed:', err)
      const message = getErrorMessage(err) || 'Unknown error'
      const code = isRecord(err) && 'code' in err ? err.code : undefined
      if (code !== undefined) {
        console.error('Error code:', code)
      }
      alert(`Approval failed: ${message}`)
    }
  }, [wallet.isAuthenticated, writeContract, networkId, checkStatus])

  const handleClaimToppings = useCallback(async () => {
    if (networkId !== BASE_CHAIN_ID) {
      alert(`Please switch to Base network (Chain ID: ${BASE_CHAIN_ID})`)
      return
    }
    if (!wallet.isAuthenticated) {
      alert('Please connect your wallet first')
      return
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
    } catch (err) {
      console.error('❌ Claim toppings failed:', err)
      const message = getErrorMessage(err) || 'Unknown error'
      alert(`Failed to claim toppings: ${message}`)
    }
  }, [networkId, wallet.isAuthenticated, writeContract, fetchPlayerInfo, fetchWeekly])

  const handleEnterGame = useCallback(async (referralCode?: string) => {
    console.log('=== ENTER GAME CLICKED ===')
    
    if (networkId !== BASE_CHAIN_ID) {
      console.error('Wrong network. Current:', networkId, 'Expected:', BASE_CHAIN_ID)
      alert(`Please switch to Base network (Chain ID: ${BASE_CHAIN_ID})`)
      return
    }
    
    if (!wallet.isAuthenticated) {
      console.error('Wallet not authenticated')
      alert('Please connect your wallet first')
      return
    }
    
    // Safely handle referral code - default to empty string
    const code = typeof referralCode === 'string' ? referralCode.trim() : ''
    
    // Pre-flight checks
    console.log('Wallet address:', wallet.address)
    console.log('VMF Balance:', vmfBalance.toString())
    console.log('Entry Fee:', (Number(entryFeeWei) / 1e18).toFixed(4), 'VMF')
    console.log('Has Enough VMF:', hasEnoughVMF)
    console.log('Needs Approval:', needsApproval)
    console.log('Has Entered Today:', hasEnteredToday)
    console.log('Referral Code:', code || '(empty)')
    
    if (!hasEnoughVMF) {
      alert(`You need at least ${(Number(entryFeeWei) / 1e18).toFixed(4)} VMF to play. You have ${(Number(vmfBalance) / 1e18).toFixed(4)} VMF.`)
      return
    }
    
    if (needsApproval) {
      alert('Please approve VMF spending first.')
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
        totalVmfWon: bigint
        lifetimeToppings: bigint
        lifetimeReferrals: bigint
      }
      
      const currentGameId = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'dailyGameId',
      }) as bigint
      
      // Handle both tuple and object formats
      const beforeVmfWon = Array.isArray(beforeStats)
        ? beforeStats[2]
        : (beforeStats as { totalVmfWon: bigint }).totalVmfWon
      
      const beforeKey = `pizza_party_vmf_before_game_${currentGameId}`
      if (typeof window !== 'undefined') {
        localStorage.setItem(beforeKey, beforeVmfWon.toString())
      }
      
      console.debug('💾 Saved before snapshot:', {
        gameId: currentGameId.toString(),
        vmfBefore: (Number(beforeVmfWon) / 1e18).toFixed(2),
      })
    } catch (snapshotErr) {
      console.warn('Failed to save before snapshot:', snapshotErr)
      // Continue anyway - fallback to calculation
    }
    // ============================================================
    
    console.log('=== FINAL PRE-TX CHECK ===')
    console.log('Contract:', PIZZA_PARTY_ADDRESS)
    console.log('Function:', 'enterDailyGame')
    console.log('Args:', [code, entryFeeWei])
    console.log('Chain ID:', networkId)
    
    try {
      // Just call writeContract - let wagmi handle everything
      // Note: Referrals are handled separately via useReferralCode()
      const result = await writeContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'enterDailyGame',
        args: [entryFeeWei], // Only pass the amount
      })
      
      // If referral code provided and this is first entry, use it separately
      if (code && code.length > 0 && playerInfo?.dailyEntries === 0n) {
        try {
          // Wait a bit for entry transaction to confirm, then use referral
          setTimeout(async () => {
            try {
              await writeContract({
                address: PIZZA_PARTY_ADDRESS as `0x${string}`,
                abi: PIZZA_PARTY_ABI,
                functionName: 'useReferralCode',
                args: [code],
              })
              console.log('✅ Referral code used successfully')
            } catch (refErr) {
              console.warn('⚠️ Failed to use referral code (non-critical):', refErr)
            }
          }, 2000)
        } catch (refErr) {
          console.warn('⚠️ Referral code handling error (non-critical):', refErr)
        }
      }
      
      console.log('✅ Transaction sent successfully:', result)
      setHasEnteredToday(true)
      
      // Refresh data after a short delay
      setTimeout(() => {
        void checkStatus()
        void fetchPlayerInfo()
        void refreshDaily()
        void fetchVmfBalance()
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
        } else if (msg.includes('allowance')) {
          message = 'Token allowance issue. Please try approving VMF again.'
        } else if (msg.includes('already') || msg.includes('played')) {
          message = 'You have already played today.'
        } else if (msg.includes('game ended') || msg.includes('game settled')) {
          message = 'Game has ended. Please wait for the next game.'
        } else if (msg.includes('weekly limit')) {
          message = 'You have reached the weekly play limit (7 entries/week).'
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
  }, [wallet.isAuthenticated, wallet.address, writeContract, networkId, checkStatus, fetchPlayerInfo, refreshDaily, fetchVmfBalance, fetchWeekly, vmfBalance, entryFeeWei, hasEnoughVMF, needsApproval, hasEnteredToday, fetchPlayerLifetimeStats, playerInfo])

  const openWalletModal = useCallback(() => open(), [open])

  useEffect(() => {
    console.debug('vmfBalance, entryFeeWei, hasEnoughVMF', vmfBalance.toString(), entryFeeWei.toString(), hasEnoughVMF)
  }, [vmfBalance, entryFeeWei, hasEnoughVMF])

  return {
    wallet,
    openWalletModal,
    vmfUsd: vmfUsdPrice,
    vmfAmount,
    vmfWei: entryFeeWei,
    vmfBalance,
    daily,
    playerInfo,
    playerWeekly,
    playerLifetimeStats,
    weekly,
    referralInfo,
    priceOracleWorking,
    pacificCountdown: { msRemaining, hours, minutes, seconds, nextResetPacific },
    hasEnoughVMF,
    isEntryInProgress: isPending,
    handleEnterGame,
    handleApproveVMF,
    handleClaimToppings,
    needsApproval,
    hasEnteredToday,
    claimableToppings,
  }
}
