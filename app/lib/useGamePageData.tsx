'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { parseEther } from 'viem'
import { readContract, watchBlockNumber } from '@wagmi/core'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import {
  PIZZA_PARTY_ADDRESS,
  PIZZA_PARTY_ABI,
  VMF_TOKEN_ADDRESS,
  VMF_TOKEN_ABI,
} from './constants'
import { wagmiConfig } from '../components/config/wagmiConfig'

const PACIFIC_TZ = 'America/Los_Angeles'
const BASE_CHAIN_ID = 8453

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

interface ReferralInfo {
  referralCode: string
  referrer: string
  totalReferrals: bigint
  lifetimeReferrals: bigint
  isActive: boolean
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

// ------------------ Hook ------------------

export function useGamePageData() {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()
  const { writeContract, isPending } = useWriteContract()
  const networkId = useChainId()

  const wallet = useMemo(() => ({
    address: address ?? '',
    isAuthenticated: !!isConnected,
    isLoading: address === undefined,
    error: null as Error | null,
  }), [address, isConnected])

  // ================= Entry Fee (Dynamic from Contract) =================
  const [entryFeeWei, setEntryFeeWei] = useState<bigint>(parseEther('111.11'))
  const [vmfUsdPrice, setVmfUsdPrice] = useState<number>(0.009)
  const [priceOracleWorking, setPriceOracleWorking] = useState<boolean>(false)

  const fetchEntryFee = useCallback(async () => {
    try {
      // Get dynamic entry fee from contract (always $1 worth of VMF)
      const feeWei = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getEntryFee',
      })
      const fee = typeof feeWei === 'bigint' ? feeWei : BigInt(String(feeWei ?? '0'))
      
      if (fee > 0n) {
        setEntryFeeWei(fee)
        setPriceOracleWorking(true)
        console.debug('✅ Entry fee fetched from contract:', fee.toString())
      }

      // Also get VMF price for display
      const priceWei = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getCurrentVMFPrice',
      })
      const price = typeof priceWei === 'bigint' ? priceWei : BigInt(String(priceWei ?? '0'))
      
      // Convert from 18 decimals to USD
      if (price > 0n) {
        const priceUsd = Number(price) / 1e18
        setVmfUsdPrice(priceUsd)
        console.debug('✅ VMF price fetched from contract:', priceUsd)
      }

    } catch (err) {
      console.error('❌ Failed to fetch entry fee from contract:', err)
      setPriceOracleWorking(false)
      // Keep existing values as fallback (initialized to ~$1 at $0.009)
      // This allows the app to work even if the SushiSwap pair isn't properly configured
      
      // Show warning to user
      console.warn('⚠️ Price oracle not working. Contract may not be properly configured.')
      console.warn('⚠️ The contract owner needs to call: setSushiswapPair("0x9C83A203133B65982F35D1B00E8283C9fb518cb1")')
    }
  }, [])

  // ================= VMF Amount for Display =================
  const vmfAmount = useMemo(() => {
    const amt = Number(entryFeeWei) / 1e18
    if (!Number.isFinite(amt) || amt <= 0) return '100'
    return amt.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
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
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)

  const fetchPlayerInfo = useCallback(async () => {
    if (!wallet.address) return
    try {
      const info = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getPlayerInfo',
        args: [wallet.address as `0x${string}`],
      }) as PlayerInfo

      setPlayerInfo(info)

      // Also fetch referral info
      const refInfo = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getReferralInfo',
        args: [wallet.address as `0x${string}`],
      }) as ReferralInfo

      setReferralInfo(refInfo)

    } catch (err) {
      console.error('Failed to fetch player info', err)
      setPlayerInfo(null)
      setReferralInfo(null)
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

  const refreshDaily = useCallback(async () => {
    try {
      // Get current daily game info
      const gameData = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'getCurrentDailyGame',
      }) as {
        gameId: bigint
        startTime: bigint
        endTime: bigint
        totalEntries: bigint
        jackpotAmount: bigint
        winners: string[]
        isCompleted: boolean
      }

      const jackpotWei = await readContract(wagmiConfig, {
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'currentDailyJackpot',
      })

      setDaily({
        dailyGameId: Number(gameData.gameId),
        totalEntries: Number(gameData.totalEntries),
        jackpot: (Number(jackpotWei) / 1e18).toString(),
        isCompleted: gameData.isCompleted,
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
        functionName: 'hasEnteredToday',
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
    void fetchEntryFee()
    void fetchVmfBalance()
    void refreshDaily()
    void checkStatus()
    void fetchPlayerInfo()

    unwatch = watchBlockNumber(wagmiConfig, {
      onBlockNumber: () => {
        void fetchEntryFee()
        void fetchVmfBalance()
        void refreshDaily()
        void checkStatus()
        void fetchPlayerInfo()
      },
      onError: () => {},
    })
    return () => { if (unwatch) unwatch() }
  }, [fetchEntryFee, fetchVmfBalance, refreshDaily, checkStatus, fetchPlayerInfo])

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
      
    } catch (err: any) {
      console.error('❌ Approve failed:', err)
      console.error('Error details:', {
        message: err?.message,
        code: err?.code,
      })
      alert(`Approval failed: ${err?.message || 'Unknown error'}`)
    }
  }, [wallet.isAuthenticated, writeContract, networkId, checkStatus])

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
        }) as any
        console.log('Current Game State:', {
          gameId: currentGame.gameId?.toString(),
          isCompleted: currentGame.isCompleted,
          endTime: currentGame.endTime?.toString(),
          currentTime: Math.floor(Date.now() / 1000),
          hasEnded: currentGame.endTime && Math.floor(Date.now() / 1000) >= Number(currentGame.endTime),
        })
        
        if (currentGame.isCompleted) {
          alert('Current game is completed. Please wait for the next game to start.')
          return
        }
      } catch (gameErr) {
        console.warn('Could not fetch game state:', gameErr)
      }
      
      // Try to simulate the call first
      console.log('Simulating contract call...')
      try {
        await readContract(wagmiConfig, {
          address: PIZZA_PARTY_ADDRESS as `0x${string}`,
          abi: PIZZA_PARTY_ABI,
          functionName: 'enterDailyGame',
          args: [code],
          account: wallet.address as `0x${string}`,
        })
        console.log('✅ Simulation passed')
      } catch (simError: any) {
        console.error('❌ Simulation failed:', simError)
        
        // Try to extract revert reason
        let revertReason = 'Unknown contract error'
        if (simError?.message) {
          if (simError.message.includes('Already entered today')) {
            revertReason = 'You have already entered today'
          } else if (simError.message.includes('Game completed')) {
            revertReason = 'Game has been completed'
          } else if (simError.message.includes('Game ended')) {
            revertReason = 'Game has ended, waiting for settlement'
          } else if (simError.message.includes('Invalid VMF price')) {
            revertReason = 'Price oracle error - SushiSwap pair not configured correctly'
          } else if (simError.message.includes('Reserves call failed')) {
            revertReason = 'Cannot fetch VMF price from SushiSwap. Contract needs configuration.'
          } else if (simError.message.includes('Invalid code')) {
            revertReason = 'Invalid referral code'
          } else if (simError.message.includes('Invite limit reached')) {
            revertReason = 'Referrer has reached their weekly invite limit'
          } else if (simError.message.includes('Already used referral')) {
            revertReason = 'You have already used a referral code'
          } else {
            revertReason = simError.message
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
      }, 3000)
      
    } catch (err: any) {
      console.error('❌ Enter game failed:', err)
      console.error('Error name:', err?.name)
      console.error('Error message:', err?.message)
      console.error('Error code:', err?.code)
      console.error('Error cause:', err?.cause)
      console.error('Error data:', err?.data)
      
      // Reset hasEnteredToday if transaction failed
      setHasEnteredToday(false)
      
      // Parse common error messages
      let errorMessage = 'Unknown error'
      if (err?.message) {
        if (err.message.includes('User rejected')) {
          errorMessage = 'Transaction rejected by user'
        } else if (err.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds for gas'
        } else if (err.message.includes('Already entered today')) {
          errorMessage = 'You have already entered today'
        } else if (err.message.includes('Game completed')) {
          errorMessage = 'This game has ended. Please wait for the next game.'
        } else if (err.message.includes('Game ended')) {
          errorMessage = 'Game ended. Please wait for settlement.'
        } else {
          errorMessage = err.message
        }
      }
      
      alert(`Failed to enter game: ${errorMessage}`)
    }
  }, [wallet.isAuthenticated, wallet.address, writeContract, networkId, checkStatus, fetchPlayerInfo, playerInfo, hasEnteredToday, needsApproval, refreshDaily, fetchVmfBalance, vmfBalance, entryFeeWei, hasEnoughVMF])

  const handleCreateReferralCode = useCallback(async () => {
    if (networkId !== BASE_CHAIN_ID || !wallet.isAuthenticated) return
    try {
      await writeContract({
        address: PIZZA_PARTY_ADDRESS as `0x${string}`,
        abi: PIZZA_PARTY_ABI,
        functionName: 'createReferralCode',
      })
      void fetchPlayerInfo()
    } catch (err) {
      console.error('❌ Create referral code failed:', err)
    }
  }, [wallet.isAuthenticated, writeContract, networkId, fetchPlayerInfo])

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
    referralInfo,
    priceOracleWorking,
    pacificCountdown: { msRemaining, hours, minutes, seconds, nextResetPacific },
    hasEnoughVMF,
    isEntryInProgress: isPending,
    handleEnterGame,
    handleApproveVMF,
    handleCreateReferralCode,
    needsApproval,
    hasEnteredToday,
  }
}