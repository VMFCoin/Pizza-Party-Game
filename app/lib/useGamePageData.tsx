'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { parseAbiItem, parseEther } from 'viem'
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
const ENTRY_FEE_WEI = GAME_CONSTANTS.ENTRY_FEE_WEI
const WEI_PER_VMF = 10n ** 18n
const VMF_USD_PRICE = 0.01
const TOPPINGS_EARNED_EVENT = parseAbiItem(
  'event ToppingsEarned(uint256 indexed weekId, address indexed player, uint256 amount, string reason)',
)

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

  // ================= Entry Fee (Fixed from Minimal Contract) =================
  const entryFeeWei = ENTRY_FEE_WEI
  const vmfUsdPrice = VMF_USD_PRICE
  const priceOracleWorking = true

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
      setVmfBalance(0n)
    }
  }, [wallet.address])

  // ================= Player Info =================
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null)
  const [playerWeekly, setPlayerWeekly] = useState<PlayerWeeklyInfo | null>(null)
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
      const weeklyInfoRaw = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerWeeklyInfo',
        args: [wallet.address as `0x${string}`],
      }) as PlayerWeeklyResponse
      const weeklyInfo = normalizeWeeklyInfo(weeklyInfoRaw)

      const normalized: PlayerInfo = {
        totalToppings: weeklyInfo.toppingsEarned,
        dailyEntries: weeklyInfo.dailyPlays,
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
        lifetimeReferrals: weeklyInfo.referralsUsed,
        isActive: referralCode.length > 0,
      }
      setReferralInfo(refInfo)
    } catch (err) {
      console.error('Failed to fetch player info', err)
      setPlayerInfo(null)
      setPlayerWeekly(null)
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
          const logs = await publicClient.getLogs({
            address: PIZZA_PARTY_ADDRESS as `0x${string}`,
            event: TOPPINGS_EARNED_EVENT,
            args: { weekId: currentWeekId },
            fromBlock: 0n,
          })

          let totalEarned = 0n
          const players = new Set<string>()

          for (const log of logs) {
            const amount = log.args?.amount ?? 0n
            totalEarned += amount
            const playerArg = log.args?.player
            if (playerArg) {
              players.add(playerArg.toLowerCase())
            }
          }

          if (totalEarned > 0n) {
            projectedJackpotWei = totalEarned * WEI_PER_VMF
          }
          if (players.size > 0) {
            projectedPlayerCount = players.size
          }
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
      setNeedsApproval(false)
      setHasEnteredToday(false)
    }
  }, [wallet.address, entryFeeWei])

  // ================= Watch blockchain =================
  useEffect(() => {
    let unwatch: (() => void) | null = null
    void fetchVmfBalance()
    void refreshDaily()
    void checkStatus()
    void fetchPlayerInfo()
    void fetchWeekly()

    unwatch = watchBlockNumber(wagmiConfig, {
      onBlockNumber: () => {
        void fetchVmfBalance()
        void refreshDaily()
        void checkStatus()
        void fetchPlayerInfo()
        void fetchWeekly()
      },
      onError: () => {},
    })
    return () => { if (unwatch) unwatch() }
  }, [fetchVmfBalance, refreshDaily, checkStatus, fetchPlayerInfo, fetchWeekly])

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
        args: [PIZZA_PARTY_ADDRESS as `0x${string}`, parseEther('100000000')],
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
    
    try {
      // Safely handle referral code - default to empty string
      const code = typeof referralCode === 'string' ? referralCode.trim() : ''
      
      // Pre-flight checks
      console.log('=== PRE-FLIGHT CHECKS ===')
      console.log('Wallet address:', wallet.address)
      console.log('VMF Balance:', vmfBalance.toString())
      console.log('Entry Fee Required:', entryFeeWei.toString())
      console.log('Has Enough VMF:', hasEnoughVMF)
      console.log('Needs Approval:', needsApproval)
      console.log('Has Entered Today:', hasEnteredToday)
      console.log('Referral Code:', code || '(empty)')
      console.log('Is First Entry:', playerInfo?.dailyEntries === 0n)
      
      // Check game state
      try {
        const currentGame = await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'getCurrentDailyGame',
        }) as DailyGameResponse

        const currentDailyId = await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'dailyGameId',
        })

        const isCompleted = isDailyGameTuple(currentGame) ? currentGame[4] : currentGame.settled
        const endTime = isDailyGameTuple(currentGame) ? currentGame[1] : currentGame.endTime

        console.log('Current Game State:', {
          gameId: currentDailyId?.toString(),
          isCompleted,
          endTime: endTime?.toString(),
          currentTime: Math.floor(Date.now() / 1000),
          hasEnded: endTime && Math.floor(Date.now() / 1000) >= Number(endTime),
        })

        if (isCompleted) {
          alert('Current game is completed. Please wait for the next game to start.')
          return
        }
      } catch (gameErr: unknown) {
        console.warn('Could not fetch game state:', gameErr)
      }
      
      // Try to simulate the call first
      console.log('Simulating contract call...')
      try {
        await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'hasPlayedDailyGame',
          args: [wallet.address as `0x${string}`],
        })
        console.log('✅ Simulation passed')
      } catch (simError: unknown) {
        console.error('❌ Simulation failed:', simError)
        
        // Try to extract revert reason
        let revertReason = 'Unknown contract error'
        const message = getErrorMessage(simError)
        if (message) {
          if (message.includes('Already played')) {
            revertReason = 'You have already entered today'
          } else if (message.includes('Game settled')) {
            revertReason = 'Game has been completed'
          } else if (message.includes('Game ended')) {
            revertReason = 'Game has ended, waiting for settlement'
          } else if (message.includes('Weekly limit reached')) {
            revertReason = 'You have reached the 7 entries per week limit'
          } else if (message.includes('Invalid code')) {
            revertReason = 'Invalid referral code'
          } else if (message.includes('Referral limit')) {
            revertReason = 'Referrer has reached their weekly invite limit'
          } else if (message.includes('Already used referral')) {
            revertReason = 'You have already used a referral code'
          } else if (message.includes('Code not found')) {
            revertReason = "This referral code hasn't been registered yet"
          } else if (message.includes('Referrer must play first')) {
            revertReason = 'Referrer must play at least once before sharing their code'
          } else if (message.includes('Cannot refer self')) {
            revertReason = "You can't use your own referral code"
          } else {
            revertReason = message
          }
        }
        
        alert(`Transaction would fail: ${revertReason}`)
        return
      }
      
      console.log('========================')
      
      if (!hasEnoughVMF) {
        alert(`Insufficient VMF balance. You need ${Number(entryFeeWei) / 1e18} VMF`)
        return
      }
      
      if (needsApproval) {
        alert('Please approve VMF spending first')
        return
      }
      
      if (hasEnteredToday) {
        alert('You have already entered today')
        return
      }
      
      console.log('Calling enterDailyGame...')
      console.log('Contract:', PIZZA_PARTY_ADDRESS)
      console.log('Args:', [code])
      
      const result = await writeContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'enterDailyGame',
        args: [code],
      })
      
      console.log('✅ Transaction submitted:', result)
      setHasEnteredToday(true)
      
      // Refresh data after a short delay
      setTimeout(() => {
        void checkStatus()
        void fetchPlayerInfo()
        void refreshDaily()
        void fetchVmfBalance()
        void fetchWeekly()
      }, 3000)
      
    } catch (err: unknown) {
      console.error('❌ Enter game failed:', err)
      const errRecord = isRecord(err) ? err : null
      const message = getErrorMessage(err)
      if (errRecord) {
        if ('name' in errRecord) console.error('Error name:', errRecord.name)
        console.error('Error message:', message)
        if ('code' in errRecord) console.error('Error code:', errRecord.code)
        if ('cause' in errRecord) console.error('Error cause:', errRecord.cause)
        if ('data' in errRecord) console.error('Error data:', errRecord.data)
      } else {
        console.error('Error message:', message)
      }
      
      // Reset hasEnteredToday if transaction failed
      setHasEnteredToday(false)
      
      // Parse common error messages
      let errorMessage = 'Unknown error'
      if (message) {
        if (message.includes('User rejected')) {
          errorMessage = 'Transaction rejected by user'
        } else if (message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds for gas'
        } else if (message.includes('Already played')) {
          errorMessage = 'You have already entered today'
        } else if (message.includes('Game settled')) {
          errorMessage = 'This game has ended. Please wait for the next game.'
        } else if (message.includes('Game ended')) {
          errorMessage = 'Game ended. Please wait for settlement.'
        } else if (message.includes('Weekly limit reached')) {
          errorMessage = 'You have reached the weekly play limit.'
        } else if (message.includes('Code not found')) {
          errorMessage = "❌ This referral code hasn't been registered yet"
        } else if (message.includes('Referrer must play first')) {
          errorMessage = '❌ Your friend needs to play at least once before you can use their code'
        } else if (message.includes('Already used referral')) {
          errorMessage = '❌ You already used a referral code!'
        } else if (message.includes('Cannot refer self')) {
          errorMessage = "❌ You can't use your own referral code"
        } else if (message.includes('Referral limit')) {
          errorMessage = '❌ Your friend has reached their weekly referral limit (3/week)'
        } else {
          errorMessage = message
        }
      }
      
      alert(`Failed to enter game: ${errorMessage}`)
    }
  }, [wallet.isAuthenticated, wallet.address, writeContract, networkId, checkStatus, fetchPlayerInfo, playerInfo, hasEnteredToday, needsApproval, refreshDaily, fetchVmfBalance, fetchWeekly, vmfBalance, entryFeeWei, hasEnoughVMF])

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
