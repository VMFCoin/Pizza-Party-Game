'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, Lock, Unlock, TrendingUp, Gift, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronUp, Share2, X } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { formatUnits, parseUnits, decodeEventLog } from 'viem'
import { sdk } from '@farcaster/miniapp-sdk'
import {
  PIZZA_STAKING_ADDRESS,
  PIZZA_STAKING_ABI,
  PIZZA_TOKEN_ADDRESS,
  PIZZA_TOKEN_ABI,
  PIZZA_PARTY_ADDRESS,
  PIZZA_PARTY_ABI,
} from '@/app/lib/constants'
import { hasEarlyAccess } from '../lib/constants/earlyAccess'
import { canTip } from '../lib/constants/tipAccess'
import { TipBalancePanel } from './TipBalancePanel'

interface StakingPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToParlor?: () => void
  onNavigateToHome?: () => void
  userFid?: number | null
  authToken?: string | null
  isBanned?: boolean
}

// Staking Tiers - yield bonuses are ADDITIVE (not multiplicative)
// NOTE: Thresholds are for 10M supply testing. Multiply by 1000 for 10B supply.
// yieldBoostBPS: basis points for calculation (150 = 1.5%, 500 = 5%, etc.)
const STAKING_TIERS = [
  { id: 0, name: 'Slice Runner', minStake: 0, yieldBoost: '+1.5%', yieldBoostBPS: 150, toppingBonus: 0, color: 'bg-gray-500', borderColor: 'border-gray-700', emoji: '🍕' },
  { id: 1, name: 'Oven Operator', minStake: 500_000_000, yieldBoost: '+3%', yieldBoostBPS: 300, toppingBonus: 1, color: 'bg-green-500', borderColor: 'border-green-700', emoji: '🔥' },
  { id: 2, name: 'Pie Boss', minStake: 2_000_000_000, yieldBoost: '+7%', yieldBoostBPS: 700, toppingBonus: 3, color: 'bg-orange-500', borderColor: 'border-orange-700', emoji: '👨‍🍳' },
  { id: 3, name: 'Pizza Tycoon', minStake: 5_000_000_000, yieldBoost: '+15%', yieldBoostBPS: 1500, toppingBonus: 5, color: 'bg-red-600', borderColor: 'border-red-800', emoji: '👑' },
]

// Bonus constants (must match contract)
const LOCK_BONUS_BPS = 500 // +5% for locked position
const EARLY_BOOST_BPS = 3000 // +30% early staker boost

// Staking limits - MIN_STAKE is now dynamic ($1 worth of PIZZA)
// Fallback used if contract call fails (10,000 PIZZA for 100B supply)
const MIN_STAKE_FALLBACK = 10_000
const _MAX_STAKE = 20_000_000_000 // 20B PIZZA maximum (20% of 100B supply) - enforced by contract

// Spin the Pie outcomes
// multiplier: displayed to user (bonus multiplier)
// multiplierValue: actual total multiplier in % (used for calculation)
// Formula: (base × bonus) + base = total, so multiplierValue = (bonus + 1) × 100
const SPIN_OUTCOMES = [
  { name: 'Regular Slice', multiplier: '1x', multiplierValue: 100, color: 'bg-yellow-400' },
  { name: 'Loaded Slice', multiplier: '1.1x', multiplierValue: 110, color: 'bg-orange-400' },
  { name: 'Hot Out the Oven', multiplier: '1.5x', multiplierValue: 150, color: 'bg-red-500' },
  { name: 'JACKPOT', multiplier: '3x', multiplierValue: 300, color: 'bg-green-600' },
]

// ==================================================================================
// SPIN THE PIE - WHEEL GEOMETRY & SLICE MAPPING
// ==================================================================================
// The pizza wheel has 8 slices, pointer is at 12 o'clock (top)
// IMPORTANT: The 12 o'clock cut line is a slice BOUNDARY, not a slice center
// The JACKPOT slice sits immediately to the RIGHT of that line
// Therefore all slice centers are OFFSET by 22.5° (half a slice)
//
// Visual layout of pizza_wheel.png (slice centers, clockwise from top):
//   Slice 0: JACKPOT 3x   - center @ 22.5°  (top-right area)
//   Slice 1: 1x Regular   - center @ 67.5°  (right)
//   Slice 2: 1.10x Loaded - center @ 112.5° (bottom-right)
//   Slice 3: 1x Regular   - center @ 157.5° (bottom)
//   Slice 4: 1.50x Hot    - center @ 202.5° (bottom-left)
//   Slice 5: 1x Regular   - center @ 247.5° (left)
//   Slice 6: 1.10x Loaded - center @ 292.5° (top-left)
//   Slice 7: 1x Regular   - center @ 337.5° (near top)

const SLICE_COUNT = 8
const SLICE_ANGLE = 360 / SLICE_COUNT // 45° per slice
const SLICE_OFFSET = SLICE_ANGLE / 2   // 22.5° - slices are offset from 12 o'clock

// Maps each outcome to valid slice indices on the wheel
// When outcome is determined, we pick one of these slices to land on
const OUTCOME_TO_SLICES: Record<string, number[]> = {
  'Regular Slice': [1, 3, 5, 7],      // Four 1x slices
  'Loaded Slice': [2, 6],              // Two 1.10x slices
  'Hot Out the Oven': [4],             // One 1.50x slice (bottom-left)
  'JACKPOT': [0],                      // One 3x slice (top-right)
}

// Calculate the rotation needed to land a specific slice under the pointer (top)
// sliceIndex: which slice (0-7) to land on
// fullSpins: number of complete rotations for dramatic effect
function getTargetRotation(sliceIndex: number, fullSpins: number = 4): number {
  // Center of the target slice - includes the 22.5° offset because
  // the JACKPOT slice is to the RIGHT of 12 o'clock, not centered on it
  const sliceCenterAngle = sliceIndex * SLICE_ANGLE + SLICE_OFFSET

  // To land this slice at the top (pointer at 0°), rotate the wheel
  // so the slice center aligns with the pointer
  const targetAngle = 360 - sliceCenterAngle

  // Add full rotations for visual effect
  return fullSpins * 360 + targetAngle
}

// Lock Types - bonuses are ADDITIVE (not multiplicative)
const LOCK_TYPES = [
  { id: 'flexible', name: 'No Lock', perks: ['Tier Rewards', 'Daily pool Rewards', 'Spin wheel'], icon: Unlock, lockType: 0 },
  { id: 'locked', name: '7-Day Lock', perks: ['25% APY', '+5% spin bonus', '15% early exit fee'], icon: Lock, lockType: 1 },
]

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

// Helper to format large numbers from wei (18 decimals)
const formatPizzaWei = (amountWei: bigint | undefined): string => {
  if (!amountWei) return '0'
  const amount = Number(formatUnits(amountWei, 18))
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
  return amount.toFixed(2)
}

// Format regular numbers (abbreviated)
const formatPizza = (amount: number): string => {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
  return amount.toFixed(2)
}

// Format with commas for exact display (2 decimal places)
const formatExact = (amount: string): string => {
  const num = parseFloat(amount)
  if (isNaN(num)) return amount
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Format wei to exact display with commas (2 decimal places)
const formatWeiExact = (amountWei: bigint | undefined): string => {
  if (!amountWei) return '0.00'
  const amount = Number(formatUnits(amountWei, 18))
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Get tier from staked amount (in whole tokens, not wei)
const getTierFromAmount = (amount: number): typeof STAKING_TIERS[0] => {
  for (let i = STAKING_TIERS.length - 1; i >= 0; i--) {
    if (amount >= STAKING_TIERS[i].minStake) {
      return STAKING_TIERS[i]
    }
  }
  return STAKING_TIERS[0]
}

export default function StakingPage({
  onBack: _unusedOnBack,
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToLeaderboard,
  onNavigateToParlor,
  onNavigateToHome,
  userFid,
  authToken,
  isBanned,
}: StakingPageProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [isMobile, setIsMobile] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinRotation, setSpinRotation] = useState(0)
  const [spinResult, setSpinResult] = useState<typeof SPIN_OUTCOMES[0] | null>(null)
  const [spinResult2, setSpinResult2] = useState<typeof SPIN_OUTCOMES[0] | null>(null) // 2nd spin result (Game 100 double spin)
  const [spinCount, setSpinCount] = useState(0) // How many spins done this game (0, 1, or 2)
  const [hasSpunThisGame, setHasSpunThisGame] = useState(false) // Track if user has spun for current game (persisted)
  const [hasClaimedThisGame, setHasClaimedThisGame] = useState(false) // Track if user has claimed for current game
  const [spinStorageChecked, setSpinStorageChecked] = useState(false) // Track if we've checked localStorage for spin result
  const [showShareModal, setShowShareModal] = useState(false) // Show share cast modal after claim
  const [claimedAmount, setClaimedAmount] = useState<bigint>(0n) // Store claimed amount for share message
  const [justClaimed, setJustClaimed] = useState(false) // Show 0 rewards briefly after claiming

  // UI state
  const [stakeAmount, setStakeAmount] = useState('')
  const [selectedLockType, setSelectedLockType] = useState<0 | 1>(0) // 0 = flexible, 1 = locked
  const [showStakeInput, setShowStakeInput] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState<'stake' | 'unstake' | 'spin-claim' | null>(null)
  const [claimLockType, setClaimLockType] = useState<0 | 1>(0) // Lock type for claimed rewards
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [unstakeLockType, setUnstakeLockType] = useState<0 | 1>(0)
  const [pendingApproval, setPendingApproval] = useState(false) // Track if we're waiting for approval to stake
  const [pendingRecordSpin, setPendingRecordSpin] = useState(false) // Track if we're waiting for recordSpin tx

  // Collapsible section state
  const [tiersOpen, setTiersOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [topStakersOpen, setTopStakersOpen] = useState(false)
  const [topStakers, setTopStakers] = useState<{
    rank: number
    fid: number
    wallet: string
    totalStaked: string
    displayName?: string
    username?: string
    pfpUrl?: string
  }[]>([])
  const [topStakersLoading, setTopStakersLoading] = useState(false)
  const [topStakersError, setTopStakersError] = useState<string | null>(null)
  const [topStakersWarning, setTopStakersWarning] = useState<string | null>(null)
  const [topStakersRefreshKey, setTopStakersRefreshKey] = useState(0)

  // Anti-sybil: Track if this FID already has a staking position
  const [stakingEligibility, setStakingEligibility] = useState<{
    canStake: boolean
    reason?: string
    existingWallet?: string
    loading: boolean
  }>({ canStake: true, loading: true })

  // === SPIN TICK/HAPTIC REFS ===
  const wheelRef = useRef<HTMLDivElement>(null)
  const tickAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastTickSliceRef = useRef<number>(-1)
  const animationFrameRef = useRef<number | null>(null)

  // Preload tick sound on mount
  useEffect(() => {
    tickAudioRef.current = new Audio('/sounds/pizza-tick.mp3')
    tickAudioRef.current.volume = 0.3
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Haptic feedback function (mobile only)
  // Uses Farcaster SDK haptics with fallback to navigator.vibrate
  const triggerHaptic = useCallback(async (intensity: 'light' | 'medium' | 'heavy' = 'light') => {
    // Try Farcaster SDK haptics first
    try {
      await sdk.haptics.impactOccurred(intensity)
    } catch {
      // Fallback to navigator.vibrate for non-Farcaster browsers
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const duration = intensity === 'heavy' ? 20 : intensity === 'medium' ? 12 : 8
        navigator.vibrate(duration)
      }
    }
  }, [])

  // Unlock audio on user gesture (required for mobile)
  const unlockAudio = useCallback(() => {
    if (tickAudioRef.current) {
      // Play and immediately pause to unlock audio context on mobile
      tickAudioRef.current.volume = 0
      tickAudioRef.current.play().then(() => {
        tickAudioRef.current!.pause()
        tickAudioRef.current!.currentTime = 0
        tickAudioRef.current!.volume = 0.3
      }).catch(() => {})
    }
  }, [])

  // Play tick sound
  const playTick = useCallback(() => {
    if (tickAudioRef.current) {
      // Clone and play for overlapping ticks
      const tick = tickAudioRef.current.cloneNode() as HTMLAudioElement
      tick.volume = 0.3
      tick.play().catch(() => {}) // Ignore autoplay errors
    }
  }, [])

  // Get current slice from rotation angle
  const getSliceFromRotation = useCallback((rotation: number): number => {
    // Normalize to 0-360
    const normalizedAngle = ((rotation % 360) + 360) % 360
    // Account for slice offset (22.5°) - the slice boundaries are at 0°, 45°, 90°, etc.
    // But the slice centers are at 22.5°, 67.5°, etc.
    // So slice 0 spans from -22.5° to 22.5° (or 337.5° to 22.5° after normalization)
    const adjustedAngle = (normalizedAngle + SLICE_OFFSET) % 360
    return Math.floor(adjustedAngle / SLICE_ANGLE) % SLICE_COUNT
  }, [])

  // === CONTRACT READS ===

  // Read user's PIZZA balance
  const { data: pizzaBalance, refetch: refetchBalance } = useReadContract({
    address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
    abi: PIZZA_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read allowance for staking contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
    abi: PIZZA_TOKEN_ABI,
    functionName: 'allowance',
    args: address ? [address, PIZZA_STAKING_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!address },
  })

  // Read user's stake info from contract (auto-refresh every 30 seconds to show rewards accumulating)
  const { data: stakeInfo, refetch: refetchStakeInfo } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'getStakeInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30000 },
  })

  // Read user's lifetime claimed rewards (unused during migration - displaying 0 instead)
  const { data: _lifetimeClaimed, refetch: refetchLifetimeClaimed } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'lifetimeClaimed',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read boost end time
  const { data: boostEndTime } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'boostEndTime',
  })

  // Read total staked in pool
  const { data: totalStakedPool } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'totalStaked',
  })

  const { data: stakerCount } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'stakerCount',
  })

  // Read spin enabled status
  const { data: spinEnabled } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'spinEnabled',
  })

  // Fetch live PIZZA price from DexScreener API for dynamic $1 minimum
  const [pizzaPrice, setPizzaPrice] = useState<number | null>(null)

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('/api/price')
        const data = await response.json()
        if (data.success && data.priceUsd) {
          setPizzaPrice(data.priceUsd)
        }
      } catch (error) {
        console.error('[Staking] Failed to fetch PIZZA price:', error)
      }
    }

    // Fetch immediately and then every 60 seconds
    fetchPrice()
    const interval = setInterval(fetchPrice, 60000)
    return () => clearInterval(interval)
  }, [])

  // Calculate minStakeFirstTime dynamically: $1 / current price
  // This ensures the minimum is always exactly $1 worth at current market price
  const minStakeFirstTime = useMemo(() => {
    if (!pizzaPrice || pizzaPrice <= 0) return MIN_STAKE_FALLBACK
    return Math.ceil(1 / pizzaPrice) // $1 divided by price per token, rounded up
  }, [pizzaPrice])

  // Read current game ID (for spin tracking)
  const { data: currentGameId } = useReadContract({
    address: PIZZA_PARTY_ADDRESS as `0x${string}`,
    abi: PIZZA_PARTY_ABI,
    functionName: 'dailyGameId',
  })

  // Read last spin game ID for user
  const { data: lastSpinGameId, refetch: refetchLastSpinGameId } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'lastSpinGameId',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read pending APY reward for locked position (auto-refresh every 30 seconds)
  const { data: pendingApyReward, refetch: refetchApyReward } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'getPendingApyReward',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30000 },
  })

  // Read configurable APY rate (0 = use default 20%)
  const { data: lockedApyBps } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'lockedApyBps',
  })

  // Calculate display APY percentage
  const apyPercent = useMemo(() => {
    const bps = Number(lockedApyBps || 0n)
    return bps > 0 ? bps / 100 : 20 // 0 means use default 20%
  }, [lockedApyBps])

  // === CONTRACT WRITES ===

  const { writeContract, data: writeHash, isPending: isWritePending, reset: resetWrite } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  })

  // Separate writeContract hook for recordSpin to handle its own tx lifecycle
  const { writeContract: writeRecordSpin, data: recordSpinHash, isPending: isRecordSpinPending, reset: resetRecordSpin } = useWriteContract()

  const { isLoading: isRecordSpinConfirming, isSuccess: isRecordSpinConfirmed } = useWaitForTransactionReceipt({
    hash: recordSpinHash,
    pollingInterval: 1_000, // Poll every 1s instead of default 4s (Base blocks are ~2s)
  })

  // === COMPUTED VALUES ===

  // Parse stake info tuple
  const userPosition = useMemo(() => {
    if (!stakeInfo) return null
    const [totalStakedAmount, flexibleAmount, lockedAmount, tier, lockEndTimestamp, totalPendingRewards, isEarlyBoostActive] = stakeInfo as [bigint, bigint, bigint, number, bigint, bigint, boolean]

    if (totalStakedAmount === 0n) return null

    return {
      totalStakedAmount,
      flexibleAmount,
      lockedAmount,
      tier,
      lockEndTimestamp: Number(lockEndTimestamp) * 1000, // Convert to ms
      totalPendingRewards,
      isEarlyBoostActive,
    }
  }, [stakeInfo])

  // Effective minimum: $1 worth for first stake to a position type, 1 PIZZA for additional stakes
  // The contract checks each position type separately, so we need to check the selected lock type
  const minStake = useMemo(() => {
    // Check if user already has a position of the SELECTED lock type
    if (userPosition) {
      // selectedLockType: 0 = flexible, 1 = locked
      const hasPositionOfSelectedType = selectedLockType === 0
        ? userPosition.flexibleAmount > 0n
        : userPosition.lockedAmount > 0n

      if (hasPositionOfSelectedType) {
        return 1 // Adding to existing position - only 1 PIZZA minimum
      }
    }
    // Creating new position of this lock type - requires $1 worth
    return minStakeFirstTime
  }, [userPosition, minStakeFirstTime, selectedLockType])

  // Get current tier from contract data
  const currentTier = useMemo(() => {
    if (!userPosition) return STAKING_TIERS[0]
    return STAKING_TIERS[userPosition.tier] || STAKING_TIERS[0]
  }, [userPosition])

  // Oven Operator (tier 1) and above get 2 spins per day; everyone else gets 1
  const effectiveMaxSpins = currentTier.id >= 1 ? 2 : 1

  // Read canSpinToday from contract (authoritative — also tier-gated on-chain)
  const { data: canSpinTodayContract, refetch: refetchCanSpin } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'canSpinToday',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read on-chain spin count for current day (authoritative for double-spin gating)
  // after a reload (localStorage only remembers there was a spin, not how many)
  const { data: spinCountTodayContract, refetch: refetchSpinCountToday } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'spinCountToday',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const isSameSpinGameDay = useMemo(() => {
    if (currentGameId == null || lastSpinGameId == null) return false
    return BigInt(lastSpinGameId) === BigInt(currentGameId)
  }, [currentGameId, lastSpinGameId])

  // On-chain spin count is only meaningful for the current game day
  const onChainSpinCountToday = useMemo(() => {
    if (spinCountTodayContract === undefined || !isSameSpinGameDay) return 0
    return Number(spinCountTodayContract)
  }, [spinCountTodayContract, isSameSpinGameDay])

  const canSpinToday = useMemo(() => {
    if (!spinEnabled) return false
    if (canSpinTodayContract !== undefined) return canSpinTodayContract as boolean
    // Fallback while contract read is loading — never assume "already spun"
    if (!currentGameId) return false
    if (!isSameSpinGameDay) return true
    return onChainSpinCountToday < effectiveMaxSpins
  }, [spinEnabled, canSpinTodayContract, currentGameId, isSameSpinGameDay, onChainSpinCountToday, effectiveMaxSpins])

  // Best-known spin count: max of on-chain and local animation state (covers RPC refetch lag).
  const spinsCompletedToday = useMemo(
    () => Math.max(onChainSpinCountToday, spinCount),
    [onChainSpinCountToday, spinCount],
  )

  // Oven Operator+ with 1 spin done still owes a second spin today.
  const awaitingSecondSpin = useMemo(() => {
    if (!spinEnabled || effectiveMaxSpins < 2 || hasClaimedThisGame) return false
    if (isSpinning || pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming) return false
    return spinsCompletedToday === 1 && canSpinToday
  }, [
    spinEnabled,
    effectiveMaxSpins,
    hasClaimedThisGame,
    isSpinning,
    pendingRecordSpin,
    isRecordSpinPending,
    isRecordSpinConfirming,
    spinsCompletedToday,
    canSpinToday,
  ])

  const allSpinsDoneToday = useMemo(() => {
    if (!hasSpunThisGame) return false
    return spinsCompletedToday >= effectiveMaxSpins || !canSpinToday
  }, [hasSpunThisGame, spinsCompletedToday, effectiveMaxSpins, canSpinToday])

  // localStorage key for persisting spin result
  const spinStorageKey = useMemo(() => {
    if (!address || !currentGameId) return null
    return `spin_result_${address}_${currentGameId}`
  }, [address, currentGameId])

  // Load persisted spin result on mount or when gameId changes
  useEffect(() => {
    if (!spinStorageKey) {
      setSpinStorageChecked(false)
      return
    }

    try {
      const stored = localStorage.getItem(spinStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        const spin1 = parsed.spin1 ?? (parsed.outcomeName ? { outcomeName: parsed.outcomeName, rotation: parsed.rotation } : null)
        const spin2 = parsed.spin2 ?? null
        const outcome1 = spin1 ? SPIN_OUTCOMES.find(o => o.name === spin1.outcomeName) : null
        const outcome2 = spin2 ? SPIN_OUTCOMES.find(o => o.name === spin2.outcomeName) : null
        if (outcome1) {
          setSpinResult(outcome1)
          setSpinResult2(outcome2 ?? null)
          setSpinCount(parsed.spinCount ?? (outcome2 ? 2 : 1))
          setHasSpunThisGame(true)
          setSpinRotation(spin1.rotation || 0)
        }
      } else {
        // No stored result for this game - reset state
        setSpinResult(null)
        setSpinResult2(null)
        setSpinCount(0)
        setHasSpunThisGame(false)
        setHasClaimedThisGame(false)
      }
      setSpinStorageChecked(true)
    } catch (e) {
      console.error('Failed to load spin result from localStorage:', e)
      setSpinStorageChecked(true)
    }
  }, [spinStorageKey])

  // Restore spin outcomes from on-chain when localStorage is missing but spins were recorded today
  const { data: committedSpinOutcomeOnChain } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'committedSpinOutcome',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isSameSpinGameDay && onChainSpinCountToday >= 1 },
  })

  const { data: committedSpinOutcome2OnChain } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'committedSpinOutcome2',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isSameSpinGameDay && onChainSpinCountToday >= 2 },
  })

  useEffect(() => {
    if (!spinStorageChecked || isSpinning || hasClaimedThisGame) return
    if (!isSameSpinGameDay || onChainSpinCountToday === 0) return

    if (committedSpinOutcomeOnChain !== undefined && !spinResult) {
      const outcome1 = SPIN_OUTCOMES[Number(committedSpinOutcomeOnChain)] ?? SPIN_OUTCOMES[0]
      setSpinResult(outcome1)
      setHasSpunThisGame(true)
    }
    if (committedSpinOutcome2OnChain !== undefined && onChainSpinCountToday >= 2) {
      const outcome2 = SPIN_OUTCOMES[Number(committedSpinOutcome2OnChain)] ?? SPIN_OUTCOMES[0]
      setSpinResult2(outcome2)
    }
    if (onChainSpinCountToday > 0) {
      setSpinCount(onChainSpinCountToday)
      setHasSpunThisGame(true)
    }
  }, [
    spinStorageChecked,
    isSpinning,
    hasClaimedThisGame,
    isSameSpinGameDay,
    onChainSpinCountToday,
    committedSpinOutcomeOnChain,
    committedSpinOutcome2OnChain,
    spinResult,
  ])

  // Save spin result(s) to localStorage when a spin completes
  const saveSpinResult = useCallback((
    spinNumber: number,
    outcome: typeof SPIN_OUTCOMES[0],
    rotation: number,
  ) => {
    if (!spinStorageKey) return
    try {
      let spin1: { outcomeName: string; rotation: number } | null = null
      let spin2: { outcomeName: string; rotation: number } | null = null
      if (spinNumber === 1) {
        spin1 = { outcomeName: outcome.name, rotation }
      } else {
        const existing = localStorage.getItem(spinStorageKey)
        if (existing) {
          const parsed = JSON.parse(existing)
          spin1 = parsed.spin1 ?? (parsed.outcomeName ? { outcomeName: parsed.outcomeName, rotation: parsed.rotation ?? 0 } : null)
        }
        spin2 = { outcomeName: outcome.name, rotation }
      }
      localStorage.setItem(spinStorageKey, JSON.stringify({
        spin1,
        spin2,
        spinCount: spinNumber,
        timestamp: Date.now(),
      }))
    } catch (e) {
      console.error('Failed to save spin result to localStorage:', e)
    }
  }, [spinStorageKey])

  // Has pending rewards that can be claimed
  const hasPendingRewards = useMemo(() => {
    if (!userPosition) return false
    return userPosition.totalPendingRewards > 0n
  }, [userPosition])

  // Calculate days remaining for early staker boost
  const boostDaysRemaining = useMemo(() => {
    if (!boostEndTime) return 0
    const remaining = Number(boostEndTime) * 1000 - Date.now()
    return Math.max(0, Math.floor(remaining / (24 * 60 * 60 * 1000)))
  }, [boostEndTime])

  // Time until unlock
  const timeUntilUnlock = useMemo(() => {
    if (!userPosition || userPosition.lockedAmount === 0n) return 'Unlocked'
    const remaining = userPosition.lockEndTimestamp - Date.now()
    if (remaining <= 0) return 'Unlocked'
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    return `${days}d ${hours}h`
  }, [userPosition])

  // Check if locked position is still locked
  const isLocked = useMemo(() => {
    if (!userPosition || userPosition.lockedAmount === 0n) return false
    return userPosition.lockEndTimestamp > Date.now()
  }, [userPosition])

  // Show total pending rewards (includes base + bonuses + APY) for display on staking card
  // This is what the contract returns from getStakeInfo().totalPendingRewards
  const baseRewardOnly = useMemo(() => {
    if (!userPosition || userPosition.totalPendingRewards === 0n) return 0n
    return userPosition.totalPendingRewards
  }, [userPosition])

  // Calculate reward breakdown for display after spin
  // This mirrors the contract's _calculateBonusAmount logic
  // If no spinResult (localStorage cleared), assume 1x multiplier for display
  const rewardBreakdown = useMemo(() => {
    if (!userPosition) return null
    if (userPosition.totalPendingRewards === 0n) return null

    const baseReward = userPosition.totalPendingRewards
    // The contract's getPendingRewards already includes bonuses and APY, so we need to work backwards
    // to show the breakdown. The totalPendingRewards = base + (base × totalBonusBPS / 10000) + APY

    // Get APY reward from contract (separate from base reward calculation)
    const apyReward = (pendingApyReward as bigint) || 0n

    // Calculate total bonus BPS
    let totalBonusBPS = currentTier.yieldBoostBPS // Tier bonus
    const hasLock = userPosition.lockedAmount > 0n
    if (hasLock) totalBonusBPS += LOCK_BONUS_BPS // +5% lock
    if (userPosition.isEarlyBoostActive) totalBonusBPS += EARLY_BOOST_BPS // +30% early

    // Work backwards: totalPendingRewards = baseOnly × (1 + totalBonusBPS/10000) + APY
    // So: baseOnly × (1 + totalBonusBPS/10000) = totalPendingRewards - APY
    // baseOnly = (totalPendingRewards - APY) × 10000 / (10000 + totalBonusBPS)
    const baseWithBonuses = baseReward > apyReward ? baseReward - apyReward : 0n
    const baseOnly = baseWithBonuses > 0n
      ? (baseWithBonuses * 10000n) / (10000n + BigInt(totalBonusBPS))
      : 0n

    // Use spin result if available, otherwise assume 1x (100) for display purposes
    const spinMultiplierValue = spinResult?.multiplierValue ?? 100
    const spinMultiplier = BigInt(spinMultiplierValue)
    const spunReward = (baseOnly * spinMultiplier) / 100n

    // Spin 2 (double spin mode)
    const spin2MultiplierValue = spinResult2?.multiplierValue ?? 0
    const spunReward2 = spin2MultiplierValue > 0 ? (baseOnly * BigInt(spin2MultiplierValue)) / 100n : 0n

    // 10M PIZZA jackpot bonus (added flat on top when outcome is Jackpot)
    const isJackpot = spinResult?.name === 'JACKPOT' || spinResult2?.name === 'JACKPOT'
    const jackpotBonus1 = spinResult?.name === 'JACKPOT' ? 10_000_000n * (10n ** 18n) : 0n
    const jackpotBonus2 = spinResult2?.name === 'JACKPOT' ? 10_000_000n * (10n ** 18n) : 0n
    const jackpotBonus = jackpotBonus1 + jackpotBonus2

    // Calculate bonuses on combined spun reward (bonuses apply AFTER spin)
    const combinedSpunReward = spunReward + spunReward2
    const bonusAmount = (combinedSpunReward * BigInt(totalBonusBPS)) / 10000n
    const totalReward = combinedSpunReward + bonusAmount + jackpotBonus + apyReward

    return {
      baseOnly,           // Raw base before any modifiers
      spinMultiplier: spinMultiplierValue,
      spunReward,         // After spin 1 multiplier
      spunReward2,        // After spin 2 multiplier (0 if no spin 2)
      tierBonus: currentTier.yieldBoost,
      tierBonusBPS: currentTier.yieldBoostBPS,
      hasLock,
      lockBonusBPS: hasLock ? LOCK_BONUS_BPS : 0,
      hasEarlyBoost: userPosition.isEarlyBoostActive,
      earlyBoostBPS: userPosition.isEarlyBoostActive ? EARLY_BOOST_BPS : 0,
      totalBonusBPS,
      bonusAmount,        // Total bonus in PIZZA
      jackpotBonus,       // 10M PIZZA flat bonus on Jackpot(s)
      isJackpot,          // Whether any spin hit Jackpot
      apyReward,          // APY reward for locked position
      totalReward,        // Final total
    }
  }, [userPosition, spinResult, spinResult2, currentTier, pendingApyReward])

  // Refetch data after successful transaction (but not during approval->stake flow)
  useEffect(() => {
    if (isConfirmed && !pendingApproval) {
      // Handle claim completion - store amount for share message BEFORE refetch clears it
      const isClaim = showConfirmModal === 'spin-claim'
      if (isClaim && rewardBreakdown?.totalReward) {
        setClaimedAmount(rewardBreakdown.totalReward)
        // Show "Just Claimed" state - display 0 rewards for 5 seconds
        setJustClaimed(true)
        setTimeout(() => setJustClaimed(false), 5000)
      }

      // Longer delay to ensure RPC node has the latest state after tx confirmation
      const refetchData = async () => {
        // Initial delay for RPC to catch up
        await new Promise(resolve => setTimeout(resolve, 3000))

        // First refetch attempt
        await Promise.all([
          refetchBalance(),
          refetchAllowance(),
          refetchStakeInfo(),
          refetchLifetimeClaimed(),
          refetchApyReward(),
          refetchLastSpinGameId(),
          refetchCanSpin(),
        ])

        // Second refetch after additional delay to ensure data is fresh
        // This handles cases where RPC nodes have slight delays
        await new Promise(resolve => setTimeout(resolve, 2000))
        await Promise.all([
          refetchBalance(),
          refetchStakeInfo(),
          refetchApyReward(),
        ])

        // Update staker database for top stakers leaderboard (after stake/unstake/restake)
        // Uses retry logic to handle flaky RPC
        if (address && (showConfirmModal === 'stake' || showConfirmModal === 'unstake' || showConfirmModal === 'spin-claim')) {
          const updateStakerWithRetry = async (retries = 3) => {
            for (let i = 0; i < retries; i++) {
              try {
                const res = await fetch('/api/staking/update-staker', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ wallet: address }),
                })
                if (res.ok) {
                  console.log('[Staker Sync] Successfully updated staker database')
                  return
                }
                console.warn(`[Staker Sync] Attempt ${i + 1} failed with status ${res.status}`)
              } catch (err) {
                console.warn(`[Staker Sync] Attempt ${i + 1} failed:`, err)
              }
              // Wait before retry (exponential backoff)
              if (i < retries - 1) {
                await new Promise(r => setTimeout(r, 2000 * (i + 1)))
              }
            }
            console.error('[Staker Sync] All retries failed')
          }
          updateStakerWithRetry()
          // Clear cached top stakers so they reload with fresh data
          setTopStakers([])
          setTopStakersRefreshKey((k) => k + 1)
        }

        // Show share modal AFTER refetch completes so UI shows updated data
        if (isClaim) {
          setClaimLockType(0)
          // Mark as claimed for this game (disables spin button until next game)
          setHasClaimedThisGame(true)
          // Show share modal after successful claim
          setShowShareModal(true)
        }
      }
      refetchData()

      setShowConfirmModal(null)
      setStakeAmount('')
      setUnstakeAmount('')
      setShowStakeInput(false)
      resetWrite()
    }
  }, [isConfirmed, pendingApproval, showConfirmModal, refetchBalance, refetchAllowance, refetchStakeInfo, refetchLifetimeClaimed, refetchApyReward, refetchLastSpinGameId, refetchCanSpin, resetWrite, rewardBreakdown])

  // === HANDLERS ===

  // Check staking eligibility via API (anti-sybil: one FID = one wallet)
  const checkStakingEligibility = useCallback(async () => {
    // Must have Farcaster account
    if (!userFid) {
      setStakingEligibility({ canStake: false, reason: 'no_fid', loading: false })
      return
    }

    // If we have auth token and wallet, do full API check (anti-sybil)
    if (authToken && address) {
      try {
        const response = await fetch(`/api/staking?wallet=${address.toLowerCase()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        const data = await response.json()
        console.log('[Staking] Eligibility check:', data)

        if (data.canStake === false) {
          setStakingEligibility({
            canStake: false,
            reason: data.reason || 'api_rejected',
            loading: false,
            existingWallet: data.existingPosition?.wallet,
          })
          return
        }
      } catch (error) {
        console.error('[Staking] Eligibility check failed:', error)
        // On API error, allow (fail open for UX)
      }
    }

    // User passed API check - they can stake
    setStakingEligibility({ canStake: true, loading: false })
  }, [userFid, authToken, address])

  useEffect(() => {
    checkStakingEligibility()
  }, [checkStakingEligibility])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fetch top stakers when dropdown is opened (once per open / refresh)
  useEffect(() => {
    if (!topStakersOpen) return

    let cancelled = false
    setTopStakersLoading(true)
    setTopStakersError(null)
    setTopStakersWarning(null)

    fetch('/api/staking/top-stakers')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok && !data.topStakers?.length) {
          throw new Error(data.error || 'Failed to fetch top stakers')
        }
        if (!cancelled) {
          setTopStakers(data.topStakers || [])
          setTopStakersWarning(data.warning || null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTopStakersError(err instanceof Error ? err.message : 'Failed to load top stakers')
          setTopStakers([])
        }
      })
      .finally(() => {
        if (!cancelled) setTopStakersLoading(false)
      })

    return () => { cancelled = true }
  }, [topStakersOpen, topStakersRefreshKey])

  const handleBack = () => {
    if (onNavigateToHome) {
      onNavigateToHome()
    }
  }

  // Register staking position with API (for anti-sybil tracking)
  const registerStakingPosition = useCallback(async (wallet: string): Promise<{ success: boolean; error?: string }> => {
    if (!authToken) return { success: false, error: 'No auth token' }
    try {
      const response = await fetch('/api/staking', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet }),
      })
      const data = await response.json()
      console.log('[Staking] API registration response:', data)
      if (data.success === true) {
        return { success: true }
      }
      return { success: false, error: data.error || 'Registration failed' }
    } catch (error) {
      console.error('[Staking] Failed to register position:', error)
      return { success: false, error: 'Network error' }
    }
  }, [authToken])

  // Handle approve + stake
  const handleStake = async () => {
    if (!address) return
    const amountNum = parseFloat(stakeAmount)
    if (isNaN(amountNum) || amountNum < minStake) return

    const amountWei = parseUnits(stakeAmount, 18)

    // Debug logging for amount mismatch investigation
    console.log('=== STAKE TRANSACTION DEBUG ===')
    console.log('stakeAmount (string):', stakeAmount)
    console.log('amountNum (parsed float):', amountNum)
    console.log('amountWei:', amountWei.toString())
    console.log('amountWei back to tokens:', formatUnits(amountWei, 18))
    console.log('selectedLockType:', selectedLockType)
    console.log('===============================')

    // ANTI-SYBIL: Register with API BEFORE staking (must succeed)
    if (authToken) {
      const result = await registerStakingPosition(address)
      if (!result.success) {
        console.error('[Staking] API registration failed:', result.error)
        alert(`Cannot stake: ${result.error || 'Registration failed'}. Each Farcaster account can only stake from one wallet.`)
        return // BLOCK the stake
      }
      console.log('[Staking] API registration successful')
    }

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    console.log('Current allowance:', currentAllowance.toString())
    console.log('Needed amount:', amountWei.toString())
    console.log('Needs approval:', currentAllowance < amountWei)

    if (currentAllowance < amountWei) {
      // Approve first - mark that we're pending approval so useEffect will stake after
      setPendingApproval(true)
      console.log('=== SENDING APPROVAL TX ===')
      console.log('Token:', PIZZA_TOKEN_ADDRESS)
      console.log('Spender:', PIZZA_STAKING_ADDRESS)
      console.log('Amount:', amountWei.toString())
      writeContract({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'approve',
        args: [PIZZA_STAKING_ADDRESS as `0x${string}`, amountWei],
      })
    } else {
      // Already approved, stake directly (no pending approval needed)
      setPendingApproval(false)

      console.log('=== SENDING STAKE TX (direct) ===')
      console.log('Contract:', PIZZA_STAKING_ADDRESS)
      console.log('Function: stake')
      console.log('Args: [amountWei, lockType] =', [amountWei.toString(), selectedLockType])
      writeContract({
        address: PIZZA_STAKING_ADDRESS as `0x${string}`,
        abi: PIZZA_STAKING_ABI,
        functionName: 'stake',
        args: [amountWei, selectedLockType],
      })
    }
  }

  // After approval completes, stake (only if we were waiting for approval)
  // NOTE: API registration already happened in handleStake() before approval
  useEffect(() => {
    const performStakeAfterApproval = async () => {
      // Only proceed if we're waiting for approval to complete before staking
      if (!pendingApproval) return
      if (!isConfirmed || !stakeAmount || showConfirmModal !== 'stake') return

      // Refetch allowance to get the updated value after approval
      const { data: freshAllowance } = await refetchAllowance()

      const amountWei = parseUnits(stakeAmount, 18)
      const currentAllowance = (freshAllowance as bigint) || 0n

      if (currentAllowance >= amountWei && address) {
        // Clear pending approval flag BEFORE sending stake tx
        setPendingApproval(false)

        // API registration already done in handleStake() - just send the stake tx
        resetWrite()
        console.log('=== SENDING STAKE TX (after approval) ===')
        console.log('Contract:', PIZZA_STAKING_ADDRESS)
        console.log('Function: stake')
        console.log('stakeAmount:', stakeAmount)
        console.log('Args: [amountWei, lockType] =', [amountWei.toString(), selectedLockType])
        writeContract({
          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
          abi: PIZZA_STAKING_ABI,
          functionName: 'stake',
          args: [amountWei, selectedLockType],
        })
      }
    }
    performStakeAfterApproval()
  }, [isConfirmed, allowance, stakeAmount, selectedLockType, showConfirmModal, address, pendingApproval, resetWrite, writeContract, refetchAllowance])

  // Handle unstake
  const handleUnstake = () => {
    if (!userPosition) return
    const amountNum = parseFloat(unstakeAmount)
    if (isNaN(amountNum) || amountNum <= 0) return

    const amountWei = parseUnits(unstakeAmount, 18)

    writeContract({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: PIZZA_STAKING_ABI,
      functionName: 'unstake',
      args: [amountWei, unstakeLockType],
    })
  }

  // Step 1: Handle SPIN button click - record spin on-chain FIRST to prevent multi-device exploit
  const handleSpin = () => {
    if (isSpinning || pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming) return
    if (!canSpinToday) return

    // Unlock audio on user gesture (required for mobile browsers)
    unlockAudio()

    // Call recordSpin() on contract - this prevents spinning on multiple devices
    setPendingRecordSpin(true)
    writeRecordSpin({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: PIZZA_STAKING_ABI,
      functionName: 'recordSpin',
      gas: 150_000n, // Skip eth_estimateGas RPC round-trip (actual ~80k, padded for safety)
    })
  }

  // Step 2: Run spin animation AFTER recordSpin tx confirms
  // The outcome is determined ON-CHAIN and passed from the SpinRecorded event
  const runSpinAnimation = useCallback((onChainOutcome: number, completedSpinNumber: number) => {
    // Only clear spinResult on first spin — preserve spin 1 result during spin 2
    if (completedSpinNumber === 1) {
      setSpinResult(null)
    }

    // Reset wheel to 0 instantly (transition is 0s when isSpinning=false)
    setSpinRotation(0)

    // Map on-chain SpinOutcome enum to SPIN_OUTCOMES array
    // Contract: 0=RegularSlice, 1=LoadedSlice, 2=HotOutTheOven, 3=Jackpot
    // SPIN_OUTCOMES: [Regular, Loaded, Hot, JACKPOT]
    const outcome = SPIN_OUTCOMES[onChainOutcome] || SPIN_OUTCOMES[0]

    // Get valid slice indices for this outcome
    const validSlices = OUTCOME_TO_SLICES[outcome.name]

    // Pick a random slice from valid options (for variety when multiple exist)
    const targetSlice = validSlices[Math.floor(Math.random() * validSlices.length)]

    // Calculate deterministic rotation to land on that slice
    // Use 3-5 full spins for dramatic effect
    const fullSpins = 3 + Math.floor(Math.random() * 3)
    const targetRotation = getTargetRotation(targetSlice, fullSpins)

    // Start spinning after reset renders (next frame)
    requestAnimationFrame(() => {
      setIsSpinning(true)
      setSpinRotation(targetRotation)
    })

    // Start tick sound/haptic loop using requestAnimationFrame
    // This polls the actual CSS transform during animation
    lastTickSliceRef.current = -1 // Reset tick tracking
    const startTime = performance.now()
    const animationDuration = 3000 // 3 seconds

    const tickLoop = () => {
      const elapsed = performance.now() - startTime
      if (elapsed >= animationDuration) {
        // Animation complete - stop loop
        animationFrameRef.current = null
        return
      }

      // Get actual rotation from the wheel element's computed transform
      if (wheelRef.current) {
        const style = window.getComputedStyle(wheelRef.current)
        const transform = style.transform
        if (transform && transform !== 'none') {
          // Extract rotation from matrix transform: matrix(cos, sin, -sin, cos, 0, 0)
          const values = transform.match(/matrix\(([^)]+)\)/)
          if (values) {
            const parts = values[1].split(',').map(Number)
            const angle = Math.atan2(parts[1], parts[0]) * (180 / Math.PI)
            // atan2 returns -180 to 180, normalize to 0-360
            const normalizedAngle = ((angle % 360) + 360) % 360
            const currentSlice = getSliceFromRotation(normalizedAngle)

            // Fire tick when crossing into a new slice
            if (currentSlice !== lastTickSliceRef.current && lastTickSliceRef.current !== -1) {
              playTick()
              triggerHaptic()
            }
            lastTickSliceRef.current = currentSlice
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(tickLoop)
    }

    // Start the tick loop
    animationFrameRef.current = requestAnimationFrame(tickLoop)

    // After animation completes, show result and persist to localStorage
    setTimeout(() => {
      // Stop tick loop if still running
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setIsSpinning(false)
      setSpinCount(completedSpinNumber)

      if (completedSpinNumber === 1) {
        setSpinResult(outcome)
      } else {
        setSpinResult2(outcome)
      }

      setHasSpunThisGame(true)
      // Persist spin result so it survives app close/reopen
      saveSpinResult(completedSpinNumber, outcome, targetRotation)
      // Heavy haptic feedback when spin completes
      triggerHaptic('heavy')

      // Also refetch contract state (awaitingSecondSpin is derived from these reads)
      refetchCanSpin()
      refetchSpinCountToday()
      refetchLastSpinGameId()
    }, 3000)
  }, [playTick, triggerHaptic, getSliceFromRotation, saveSpinResult, refetchCanSpin, refetchSpinCountToday, refetchLastSpinGameId])

  // After recordSpin tx confirms, read the outcome from the tx receipt and run animation
  // IMPORTANT: We read from the receipt (not contract state) because an RPC node may serve
  // stale state from a previous block, returning yesterday's outcome instead of today's.
  // The receipt is guaranteed to reflect the exact block the tx was mined in.
  useEffect(() => {
    if (isRecordSpinConfirmed && pendingRecordSpin && publicClient && recordSpinHash && address) {
      const fetchOutcomeAndAnimate = async () => {
        setPendingRecordSpin(false)

        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: recordSpinHash })

          let onChainOutcome = 0
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: PIZZA_STAKING_ABI,
                data: log.data,
                topics: log.topics,
              })
              if (decoded.eventName === 'SpinRecorded') {
                const args = decoded.args as unknown as { outcome: number }
                onChainOutcome = Number(args.outcome)
                console.log('[Spin] On-chain outcome from receipt:', onChainOutcome, ['Regular', 'Loaded', 'Hot', 'JACKPOT'][onChainOutcome])
                break
              }
            } catch {
              // Not the event we're looking for
            }
          }

          // Read spinCountToday from the same block — authoritative spin number for this animation
          const spinCountOnChain = await publicClient.readContract({
            address: PIZZA_STAKING_ADDRESS as `0x${string}`,
            abi: PIZZA_STAKING_ABI,
            functionName: 'spinCountToday',
            args: [address],
            blockNumber: receipt.blockNumber,
          })

          resetRecordSpin()
          runSpinAnimation(onChainOutcome, Number(spinCountOnChain))
        } catch (error) {
          console.error('[Spin] Failed to get tx receipt:', error)
          resetRecordSpin()
          runSpinAnimation(0, 1)
        }
      }

      fetchOutcomeAndAnimate()
    }
  }, [isRecordSpinConfirmed, pendingRecordSpin, publicClient, recordSpinHash, address, resetRecordSpin, runSpinAnimation])

  // Handle share cast after successful claim
  const handleShareCast = useCallback(async () => {
    const shareText = `🍕 EXTRA $PIZZA ACTIVATED\n\n${formatPizzaWei(claimedAmount)} $PIZZA claimed after one spin.\n\nStake $PIZZA to earn daily.\nSpin once per day.\nMultiply what you've earned.\n\nIt's not just staking.\nIt's a game inside the game.\n\nPull up and grab a slice:`
    const embedUrl = 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

    // Use Farcaster SDK composeCast to stay in-app
    sdk.actions.composeCast({
      text: shareText,
      embeds: [embedUrl],
    }).catch(err => console.error('[Staking] composeCast failed:', err))

    setShowShareModal(false)
  }, [claimedAmount])

  // Handle viewing a Farcaster profile
  const handleViewProfile = useCallback(async (fid: number | undefined) => {
    if (!fid) return
    try {
      await sdk.actions.viewProfile({ fid })
    } catch (error) {
      console.error('Failed to open profile:', error)
    }
  }, [])

  // Handle Buy $Pizza - opens token view in Farcaster
  const handleBuyPizza = useCallback(async () => {
    try {
      // CAIP-19 format: eip155:chainId/erc20:tokenAddress
      // Base chainId is 8453, PIZZA token address
      await sdk.actions.viewToken({
        token: 'eip155:8453/erc20:0xa821f2ee19f4f62e404c934d43eb6e5763fbdb07'
      })
    } catch (error) {
      console.error('Failed to open token view:', error)
    }
  }, [])

  // Derived values for display (abbreviated format for compact areas)
  const walletBalanceDisplay = formatPizzaWei(pizzaBalance as bigint | undefined)

  return (
    <div
      className="min-h-screen p-4"
      style={{
        backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
      }}
    >
      <div className="max-w-md mx-auto">
        {onNavigateToHome && (
          <Button
            onClick={handleBack}
            className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
            style={{ ...customFontStyle, fontFamily: 'var(--font-luckiest-guy)' }}
          >
            <ArrowLeft size={20} />
            Back to Home
          </Button>
        )}

        <Card
          className="border-4 border-red-800 rounded-3xl shadow-2xl p-3 !bg-transparent"
          style={{
            backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="flex flex-col gap-1">
            {/* Header */}
            <img
              src="/images/Spin-the-Pie-Title-Card.png"
              alt="Spin the Pie - Stake $PIZZA, Earn Rewards"
              className="w-full h-auto"
            />

            {/* Your Position Card */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95 !py-0">
              <div className="px-3 pb-2 pt-1">
                {/* Early Staker Boost Banner */}
                {boostDaysRemaining > 0 && (
                  <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-lg px-2 py-1.5 border-2 border-yellow-600 flex items-center gap-2 mb-3">
                    <Gift className="text-yellow-800" size={16} />
                    <div className="flex-1">
                      <p className="text-white font-bold" style={{ ...customFontStyle, fontSize: '16px', textShadow: '2px 2px 3px #000' }}>
                        EARLY STAKER BOOST ACTIVE!
                      </p>
                      <p className="text-yellow-800 text-xs">
                        +30% rewards for {boostDaysRemaining} more days
                      </p>
                    </div>
                    <TrendingUp className="text-yellow-800" size={16} />
                  </div>
                )}

                <p
                  className="text-green-600 text-center mb-1"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '32px', lineHeight: '1', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}
                >
                  Your Staking Position
                </p>

                {userPosition ? (
                  <div className="space-y-2">
                    {/* Compact Tier + Bonuses Row */}
                    <div className={`${currentTier.color} ${currentTier.borderColor} border-4 rounded-xl px-2 py-1 text-white`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg">{currentTier.emoji}</span>
                          <div>
                            <p className="font-bold text-sm" style={customFontStyle}>{currentTier.name}</p>
                            <p className="text-xs opacity-90 whitespace-nowrap">+{currentTier.toppingBonus} toppings/week</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{currentTier.yieldBoost}</span>
                          {userPosition.lockedAmount > 0n && <span className="bg-white/20 px-2 py-0.5 rounded text-xs">+5% Lock</span>}
                          {userPosition.isEarlyBoostActive && <span className="bg-yellow-400/30 px-2 py-0.5 rounded text-xs">+30% Boost</span>}
                        </div>
                      </div>
                    </div>

                    {/* Amount Staked - Full Width */}
                    <div className="bg-blue-50 rounded-lg px-3 py-1.5 border-2 border-blue-700">
                      <p className="text-black text-sm mb-0.5" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Amount Staked</p>
                      <div className="space-y-0">
                        {userPosition.flexibleAmount > 0n && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-green-600 text-xs">
                              <Unlock size={12} />
                              <span style={{ fontFamily: 'var(--font-luckiest-guy)' }}>No Lock</span>
                            </div>
                            <p className="text-green-800 font-bold text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                              {formatWeiExact(userPosition.flexibleAmount)} PIZZA
                            </p>
                          </div>
                        )}
                        {userPosition.lockedAmount > 0n && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-blue-600 text-xs">
                              <Lock size={12} />
                              <span style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Locked ({apyPercent}% APY)</span>
                            </div>
                            <div className="text-right">
                              <p className="text-blue-800 font-bold text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                {formatWeiExact(userPosition.lockedAmount)} PIZZA
                              </p>
                              <p className="text-blue-400 text-[10px]" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{timeUntilUnlock}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pending Rewards - Compact */}
                    <div className="bg-yellow-50 rounded-lg p-2 border-2 border-yellow-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-black text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Rewards</p>
                          <p className="text-black font-bold text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            {formatPizzaWei(justClaimed ? 0n : baseRewardOnly)} PIZZA
                          </p>
                        </div>
                        <Button
                          onClick={() => setShowConfirmModal('spin-claim')}
                          disabled={!hasPendingRewards || isWritePending || isConfirming || hasClaimedThisGame || isBanned}
                          className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-1.5 px-3 rounded-xl border-2 border-yellow-700 disabled:opacity-50 text-sm"
                          style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                        >
                          {isWritePending || isConfirming ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : hasClaimedThisGame ? (
                            'CLAIMED ✓'
                          ) : awaitingSecondSpin ? (
                            'SPIN AGAIN'
                          ) : !canSpinToday ? (
                            'CLAIM'
                          ) : (
                            'SPIN & CLAIM'
                          )}
                        </Button>
                      </div>
                      {/* Lifetime Claimed */}
                      <div className="mt-1 pt-1 border-t border-yellow-200">
                        <p className="text-black text-xs text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                          Lifetime Claimed: {formatPizzaWei(_lifetimeClaimed as bigint)} PIZZA
                        </p>
                      </div>
                    </div>

                    {/* Tip Balance Panel — shows tip jar balance + withdraw to wallet */}
                    <TipBalancePanel userFid={userFid} />

                    {/* Wallet Balance & Total Staked */}
                    <div className="text-xs bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Wallet:</span>
                        <span className="text-gray-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatWeiExact(pizzaBalance as bigint)} PIZZA</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Total Staked:</span>
                        <span className="text-gray-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatWeiExact(userPosition?.totalStakedAmount)} PIZZA</span>
                      </div>
                    </div>

                    {/* Stake More Input (shown when showStakeInput is true) */}
                    {showStakeInput ? (
                      <div className="space-y-2 bg-green-50 rounded-lg p-3 border-2 border-green-300">
                        <p className="text-green-700 font-bold text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Add to Your Stake</p>

                        {/* Stake Amount Input */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Amount to Stake
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={stakeAmount}
                              onChange={(e) => setStakeAmount(e.target.value)}
                              placeholder="Enter amount"
                              className="flex-1 min-w-0 px-2 py-2 border-2 border-green-300 rounded-xl focus:border-green-500 focus:outline-none"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            />
                            <Button
                              onClick={() => {
                                if (pizzaBalance) {
                                  setStakeAmount(formatUnits(pizzaBalance as bigint, 18))
                                }
                              }}
                              className="!bg-green-200 hover:!bg-green-300 text-green-700 font-bold px-2 rounded-xl border-2 border-green-400 flex-shrink-0"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              MAX
                            </Button>
                          </div>
                          <div className="flex gap-1 mt-1">
                            {[25, 50, 75, 100].map((pct) => (
                              <button
                                key={pct}
                                onClick={() => {
                                  if (pizzaBalance) {
                                    const bal = pizzaBalance as bigint
                                    const amount = pct === 100 ? bal : (bal * BigInt(pct)) / 100n
                                    setStakeAmount(formatUnits(amount, 18))
                                  }
                                }}
                                className="flex-1 py-0.5 rounded-lg border border-green-400 bg-green-100 hover:bg-green-200 text-green-700 text-[10px] font-bold"
                                style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                          <p className="text-gray-500 text-xs mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Available: {formatWeiExact(pizzaBalance as bigint)} PIZZA (Min: 1 PIZZA)
                          </p>
                        </div>

                        {/* Lock Type Selection */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Lock Period
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {LOCK_TYPES.map((lockType) => {
                              const Icon = lockType.icon
                              const isSelected = selectedLockType === lockType.lockType
                              return (
                                <button
                                  key={lockType.id}
                                  onClick={() => setSelectedLockType(lockType.lockType as 0 | 1)}
                                  className={`p-3 rounded-xl border-2 transition-all ${
                                    isSelected
                                      ? 'border-green-500 bg-green-100'
                                      : 'border-gray-200 bg-white hover:border-green-300'
                                  }`}
                                >
                                  <Icon size={20} className={isSelected ? 'text-green-600 mx-auto' : 'text-gray-400 mx-auto'} />
                                  <p className={`font-bold text-sm mt-1 ${isSelected ? 'text-green-700' : 'text-gray-600'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                    {lockType.name}
                                  </p>
                                  {lockType.perks.map((perk, i) => (
                                    <p key={i} className={`text-[10px] ${lockType.id === 'locked' && i === lockType.perks.length - 1 ? 'text-orange-500' : isSelected ? 'text-green-600' : 'text-gray-500'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                      {perk}
                                    </p>
                                  ))}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setShowStakeInput(false)
                              setStakeAmount('')
                            }}
                            className="flex-1 !bg-gray-300 hover:!bg-gray-400 text-gray-700 font-bold py-2 rounded-xl border-2 border-gray-400"
                            style={{ fontFamily: 'var(--font-luckiest-guy)', fontWeight: 'bold' as const }}
                          >
                            CANCEL
                          </Button>
                          <Button
                            onClick={() => setShowConfirmModal('stake')}
                            disabled={!stakeAmount || parseFloat(stakeAmount) < minStake || isWritePending || isConfirming || isBanned}
                            className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-2 rounded-xl border-2 border-green-700 disabled:opacity-50"
                            style={customFontStyle}
                          >
                            {isWritePending || isConfirming ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              'STAKE'
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Stake / Buy / Unstake Buttons */
                      <div className="flex gap-1.5 w-full">
                        <Button
                          onClick={() => setShowStakeInput(true)}
                          className="flex-1 min-w-0 !bg-green-500 hover:!bg-green-600 text-white font-bold py-2 px-2 rounded-xl border-2 border-green-700 text-sm whitespace-nowrap"
                          style={customFontStyle}
                        >
                          STAKE
                        </Button>
                        <Button
                          onClick={handleBuyPizza}
                          className="flex-1 min-w-0 !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 px-1 rounded-xl border-2 border-yellow-700 text-xs whitespace-nowrap"
                          style={customFontStyle}
                        >
                          BUY $PIZZA
                        </Button>
                        <Button
                          onClick={() => setShowConfirmModal('unstake')}
                          className="flex-1 min-w-0 !bg-red-500 hover:!bg-red-600 text-white font-bold py-2 px-2 rounded-xl border-2 border-red-700 text-sm whitespace-nowrap"
                          style={customFontStyle}
                        >
                          {isLocked ? (
                            <span className="flex items-center justify-center gap-1">
                              <AlertTriangle size={12} />
                              UNSTAKE
                            </span>
                          ) : (
                            'UNSTAKE'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  // No position - Show stake interface or blocked message
                  <div className="space-y-2">
                    {stakingEligibility.loading ? (
                      <div className="text-center py-4">
                        <Loader2 className="animate-spin mx-auto text-gray-400" size={24} />
                        <p className="text-gray-500 text-sm mt-2">Checking eligibility...</p>
                      </div>
                    ) : !stakingEligibility.canStake && stakingEligibility.reason === 'not_whitelisted' ? (
                      // BLOCKED: Not in whitelist
                      <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-300">
                        <div className="flex items-center gap-3 mb-2">
                          <AlertTriangle className="text-orange-500" size={24} />
                          <p className="text-orange-700 font-bold" style={customFontStyle}>
                            Private Testing
                          </p>
                        </div>
                        <p className="text-orange-600 text-sm">
                          Staking is currently in private testing mode. Check back soon!
                        </p>
                      </div>
                    ) : !stakingEligibility.canStake && stakingEligibility.reason === 'fid_already_staking' ? (
                      // BLOCKED: Already has position on another wallet
                      <div className="bg-red-50 rounded-xl p-4 border-2 border-red-300">
                        <div className="flex items-center gap-3 mb-2">
                          <XCircle className="text-red-500" size={24} />
                          <p className="text-red-700 font-bold" style={customFontStyle}>
                            Already Staking
                          </p>
                        </div>
                        <p className="text-red-600 text-sm mb-2">
                          Your Farcaster account already has an active staking position on another wallet.
                        </p>
                        {stakingEligibility.existingWallet && (
                          <p className="text-red-500 text-xs font-mono break-all">
                            Wallet: {stakingEligibility.existingWallet}
                          </p>
                        )}
                      </div>
                    ) : !stakingEligibility.canStake && stakingEligibility.reason === 'wallet_already_registered' ? (
                      // BLOCKED: Wallet is registered to a different Farcaster account
                      <div className="bg-red-50 rounded-xl p-4 border-2 border-red-300">
                        <div className="flex items-center gap-3 mb-2">
                          <XCircle className="text-red-500" size={24} />
                          <p className="text-red-700 font-bold" style={customFontStyle}>
                            Wallet Already Used
                          </p>
                        </div>
                        <p className="text-red-600 text-sm">
                          This wallet is already registered to a different Farcaster account. Each wallet can only stake from one Farcaster account.
                        </p>
                      </div>
                    ) : !showStakeInput ? (
                      <>
                        <div className="text-center py-1">
                          <p className="text-gray-500 text-sm mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            You have no staked position
                          </p>
                          <p className="text-green-600 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Wallet: {walletBalanceDisplay} PIZZA
                          </p>
                        </div>
                        <Button
                          onClick={() => setShowStakeInput(true)}
                          className="w-full !bg-green-500 hover:!bg-green-600 text-white font-bold py-3 rounded-xl border-4 border-green-700"
                          style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 18 }}
                        >
                          START STAKING
                        </Button>
                      </>
                    ) : (
                      <>
                        {/* Stake Amount Input */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Amount to Stake
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={stakeAmount}
                              onChange={(e) => setStakeAmount(e.target.value)}
                              placeholder={minStake === 1 ? 'Min: 1 PIZZA' : `Min: $1 (~${formatPizza(minStake)} PIZZA)`}
                              className="flex-1 min-w-0 px-2 py-2 border-2 border-green-300 rounded-xl focus:border-green-500 focus:outline-none"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            />
                            <Button
                              onClick={() => {
                                if (pizzaBalance) {
                                  setStakeAmount(formatUnits(pizzaBalance as bigint, 18))
                                }
                              }}
                              className="!bg-green-200 hover:!bg-green-300 text-green-700 font-bold px-2 rounded-xl border-2 border-green-400 flex-shrink-0"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              MAX
                            </Button>
                          </div>
                          <p className="text-gray-500 text-xs mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Balance: {walletBalanceDisplay} PIZZA
                          </p>
                        </div>

                        {/* Preview Tier */}
                        {stakeAmount && parseFloat(stakeAmount) >= minStake && (
                          <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                            <p className="text-green-600 text-xs mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Your tier will be:</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getTierFromAmount(parseFloat(stakeAmount)).emoji}</span>
                              <span className="text-green-800 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                {getTierFromAmount(parseFloat(stakeAmount)).name}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Lock Type Selection */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Lock Period
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {LOCK_TYPES.map((lockType) => {
                              const Icon = lockType.icon
                              const isSelected = selectedLockType === lockType.lockType
                              return (
                                <button
                                  key={lockType.id}
                                  onClick={() => setSelectedLockType(lockType.lockType as 0 | 1)}
                                  className={`p-3 rounded-xl border-2 transition-all ${
                                    isSelected
                                      ? 'border-green-500 bg-green-100'
                                      : 'border-gray-200 bg-white hover:border-green-300'
                                  }`}
                                >
                                  <Icon size={20} className={isSelected ? 'text-green-600 mx-auto' : 'text-gray-400 mx-auto'} />
                                  <p className={`font-bold text-sm mt-1 ${isSelected ? 'text-green-700' : 'text-gray-600'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                    {lockType.name}
                                  </p>
                                  {lockType.perks.map((perk, i) => (
                                    <p key={i} className={`text-[10px] ${lockType.id === 'locked' && i === lockType.perks.length - 1 ? 'text-orange-500' : isSelected ? 'text-green-600' : 'text-gray-500'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                      {perk}
                                    </p>
                                  ))}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setShowStakeInput(false)}
                            className="flex-1 !bg-gray-300 hover:!bg-gray-400 text-gray-700 font-bold py-2 rounded-xl border-2 border-gray-400"
                            style={{ fontFamily: 'var(--font-luckiest-guy)', fontWeight: 'bold' as const }}
                          >
                            CANCEL
                          </Button>
                          <Button
                            onClick={() => setShowConfirmModal('stake')}
                            disabled={!stakeAmount || parseFloat(stakeAmount) < minStake || isWritePending || isConfirming || isBanned}
                            className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-2 rounded-xl border-2 border-green-700 disabled:opacity-50"
                            style={customFontStyle}
                          >
                            {isWritePending || isConfirming ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              'STAKE'
                            )}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Staking Tiers - Collapsible */}
            <div className="tiers-dropdown">
              <Button
                onClick={() => setTiersOpen(!tiersOpen)}
                className={`w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2 border-4 border-orange-800 uppercase flex items-center justify-between ${tiersOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 16 : 18 }}
              >
                <span className="flex-1 text-center flex items-center justify-center gap-2">
                  <Image src="/images/pepperoni-art.png" alt="" width={20} height={20} />
                  STAKING TIERS
                  <Image src="/images/pepperoni-art.png" alt="" width={20} height={20} />
                </span>
                {tiersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </Button>
              {tiersOpen && (
                <div className="bg-orange-100 border-4 border-t-0 border-orange-800 rounded-b-xl p-3">
                  <div className="space-y-2">
                    {STAKING_TIERS.map((tier) => {
                      const isCurrentTier = userPosition && currentTier.id === tier.id
                      return (
                        <div
                          key={tier.id}
                          className={`rounded-lg p-2 border-2 transition-all ${
                            isCurrentTier
                              ? `${tier.color} border-white text-white`
                              : 'bg-white border-orange-300'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span
                              className={`font-bold flex items-center gap-1 whitespace-nowrap ${isCurrentTier ? 'text-white' : 'text-orange-700'}`}
                              style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 14 }}
                            >
                              <span>{tier.emoji}</span>
                              {tier.name}
                              {isCurrentTier && <span className="text-xs ml-1">(YOU)</span>}
                            </span>
                            <span
                              className={`text-xs ${isCurrentTier ? 'text-white/90' : 'text-orange-500'}`}
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              {tier.minStake > 0 ? `${formatPizza(tier.minStake)}+ PIZZA` : '0-499.99M PIZZA'}
                            </span>
                          </div>
                          <div className={`flex justify-between text-xs mt-1 ${isCurrentTier ? 'text-white/80' : 'text-orange-600'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            <span>Yield: {tier.yieldBoost}</span>
                            <span>+{tier.toppingBonus} toppings/week</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Staking Stats - Collapsible */}
            <div className="stats-dropdown">
              <Button
                onClick={() => setStatsOpen(!statsOpen)}
                className={`w-full !bg-blue-500 hover:!bg-blue-600 text-white font-bold py-2 border-4 border-blue-800 uppercase flex items-center justify-between ${statsOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 16 : 18 }}
              >
                <span className="flex-1 text-center flex items-center justify-center gap-2">
                  <Image src="/images/mushroom-icon2.png" alt="" width={20} height={20} />
                  POOL STATS
                  <Image src="/images/mushroom-icon2.png" alt="" width={20} height={20} />
                </span>
                {statsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </Button>
              {statsOpen && (
                <div className="bg-blue-100 border-4 border-t-0 border-blue-800 rounded-b-xl p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Total Pizza Staked</p>
                      <p className="text-blue-700 font-bold text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatWeiExact(totalStakedPool as bigint)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Daily Pot Share</p>
                      <p className="text-blue-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>10%</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Players Staking</p>
                      <p className="text-blue-700 font-bold text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{stakerCount?.toString() ?? '0'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Current APY</p>
                      <p className="text-blue-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{apyPercent}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Top Stakers - Collapsible Gold */}
            <div className="top-stakers-dropdown">
              <Button
                onClick={() => setTopStakersOpen(!topStakersOpen)}
                className={`w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 border-4 border-yellow-700 uppercase flex items-center justify-between ${topStakersOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 16 : 18 }}
              >
                <span className="flex-1 text-center flex items-center justify-center gap-2">
                  <span>👑</span>
                  TOP 20 STAKERS
                  <span>👑</span>
                </span>
                {topStakersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </Button>
              {topStakersOpen && (
                <div className="bg-yellow-100 border-4 border-t-0 border-yellow-700 rounded-b-xl p-3 max-h-96 overflow-y-auto">
                  {topStakersWarning && !topStakersLoading && (
                    <p className="text-xs text-yellow-800 mb-2 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      {topStakersWarning}
                    </p>
                  )}
                  {topStakersLoading ? (
                    <div className="text-center py-4">
                      <p className="text-yellow-700" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Loading...</p>
                    </div>
                  ) : topStakersError ? (
                    <div className="text-center py-4">
                      <p className="text-red-700 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                        {topStakersError}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTopStakersRefreshKey((k) => k + 1)}
                        className="mt-2 text-xs underline text-yellow-800"
                      >
                        Retry
                      </button>
                    </div>
                  ) : topStakers.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-yellow-700" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>No stakers yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {topStakers.map((staker) => (
                        <div
                          key={staker.wallet}
                          className={`rounded-lg p-2 border-2 flex items-center gap-2 ${
                            staker.rank === 1
                              ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 border-yellow-600'
                              : staker.rank === 2
                              ? 'bg-gradient-to-r from-gray-300 to-gray-400 border-gray-500'
                              : staker.rank === 3
                              ? 'bg-gradient-to-r from-orange-400 to-orange-500 border-orange-600'
                              : 'bg-white border-yellow-300'
                          }`}
                        >
                          {/* Rank */}
                          <span
                            className="font-bold text-sm w-6 text-gray-600"
                            style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                          >
                            #{staker.rank}
                          </span>
                          {/* PFP - clickable to view profile with blue ring on hover */}
                          <div
                            className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-yellow-200 ${staker.fid ? 'cursor-pointer hover:ring-2 hover:ring-blue-400' : ''}`}
                            onClick={() => handleViewProfile(staker.fid)}
                          >
                            {staker.pfpUrl ? (
                              <Image
                                src={staker.pfpUrl}
                                alt=""
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-yellow-600">
                                🍕
                              </div>
                            )}
                          </div>
                          {/* Name & Amount */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold text-sm truncate text-gray-600"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              {staker.displayName || staker.username || `${staker.wallet.slice(0, 6)}...${staker.wallet.slice(-4)}`}
                            </p>
                            <p
                              className="text-xs text-gray-600"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              {formatPizza(parseFloat(staker.totalStaked))} PIZZA
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* How It Works - Always Visible */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95 !py-0">
              <div className="px-3 py-2">
                <p
                  className="text-green-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', lineHeight: '1', textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)' }}
                >
                  How Staking Works
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>First stake minimum: $1 (~{formatPizza(minStakeFirstTime)} PIZZA)</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Stake PIZZA to earn 10% of every daily pot (evenly split between all stakers)</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Spin the Pie once per day to claim rewards (1x-3x multiplier)</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Higher tiers = more yield + bonus toppings</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>7-day lock = +5% spin bonus + {apyPercent}% APY</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Locked stakers earn {apyPercent}% APY to their Rewards</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Early locked unstake = 15% penalty from amount being unstaked, evenly split to all Parlor owners</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Early staker boost: +30% for {boostDaysRemaining} days</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Max stake: 20B PIZZA per wallet</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Spin the Gold Slice and win an extra 10M $Pizza</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Navigation Buttons */}
            <Button
              onClick={onNavigateToDaily}
              disabled={isBanned}
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍕 GRAB A SLICE 🍕
            </Button>

            <Button
              onClick={onNavigateToWeekly}
              disabled={isBanned}
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <span className="flex items-center justify-center w-full gap-2">
                <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
                <span className="text-center">Claim Toppings</span>
                <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
              </span>
            </Button>

            <Button
              onClick={onNavigateToLeaderboard}
              disabled={isBanned}
              className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <span className="flex items-center justify-center w-full gap-2">
                <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
                <span className="text-center">Leaderboard</span>
                <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
              </span>
            </Button>

            <Button
              onClick={onNavigateToParlor}
              disabled={isBanned}
              className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 rounded-xl border-4 border-orange-800 uppercase disabled:opacity-50 disabled:pointer-events-none"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍍 OWN A PARLOR 🍍
            </Button>

            {/* Stickers & Chat */}
            <div className="flex w-full gap-2">
              <Button
                onClick={() => window.location.href = '/sticker'}
                className="flex-1 !bg-red-600 hover:!bg-red-700 text-white py-3 px-2 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 14 : 16, fontWeight: '900' }}
              >
                <span className="flex items-center justify-center w-full gap-1">
                  <img src="/images/pizza_party_BW_qr.png" alt="" className="inline-block" style={{ height: '0.9em', width: '0.9em' }} />
                  <span className="text-center">PIZZA STICKERS</span>
                  <img src="/images/pizza_party_BW_qr.png" alt="" className="inline-block" style={{ height: '0.9em', width: '0.9em' }} />
                </span>
              </Button>
              <Button
                onClick={() => window.location.href = '/chat'}
                disabled={!hasEarlyAccess(userFid, address)}
                className="flex-1 !bg-red-600 hover:!bg-red-700 text-white py-3 px-2 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 14 : 16, fontWeight: '900' }}
              >
                🍕 PIZZA CHAT 🍕
              </Button>
            </div>
          </div>
        </Card>

        {/* Confirmation Modals */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="border-4 border-red-800 rounded-2xl bg-white max-w-sm w-full p-4">
              {showConfirmModal === 'stake' && (
                <>
                  <p className="text-xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    Confirm Stake
                  </p>
                  <div className="bg-green-50 rounded-lg p-3 mb-4">
                    <p className="text-green-700 text-sm">Amount: <span className="font-bold">{formatExact(stakeAmount)} PIZZA</span></p>
                    <p className="text-green-700 text-sm">Lock Type: <span className="font-bold">{selectedLockType === 1 ? '7-Day Lock (+5%)' : 'Flexible'}</span></p>
                    {selectedLockType === 1 && (
                      <p className="text-orange-600 text-xs mt-2">
                        <AlertTriangle size={12} className="inline mr-1" />
                        Early unstake = 15% penalty
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowConfirmModal(null)}
                      className="flex-1 !bg-gray-300 hover:!bg-gray-400 text-gray-700 font-bold py-2 rounded-xl"
                      disabled={isWritePending || isConfirming}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleStake}
                      className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-2 rounded-xl"
                      disabled={isWritePending || isConfirming || isBanned}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'Confirm'
                      )}
                    </Button>
                  </div>
                </>
              )}

              {showConfirmModal === 'unstake' && (
                <>
                  <p className="text-xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    Unstake PIZZA
                  </p>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">Amount to Unstake</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={unstakeAmount}
                          onChange={(e) => setUnstakeAmount(e.target.value)}
                          placeholder="Amount"
                          className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            const maxAmount = unstakeLockType === 0
                              ? userPosition?.flexibleAmount
                              : userPosition?.lockedAmount
                            if (maxAmount) {
                              setUnstakeAmount(formatUnits(maxAmount, 18))
                            }
                          }}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-sm"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">From Position</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setUnstakeLockType(0)}
                          className={`flex-1 py-2 px-3 rounded-lg border-2 ${unstakeLockType === 0 ? 'bg-green-100 border-green-500' : 'border-gray-300'}`}
                        >
                          <div className="font-bold">Flexible</div>
                          <div className="text-xs text-gray-600">
                            {userPosition?.flexibleAmount ? formatPizzaWei(userPosition.flexibleAmount) : '0'} PIZZA
                          </div>
                        </button>
                        <button
                          onClick={() => setUnstakeLockType(1)}
                          className={`flex-1 py-2 px-3 rounded-lg border-2 ${unstakeLockType === 1 ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
                        >
                          <div className="font-bold">Locked</div>
                          <div className="text-xs text-gray-600">
                            {userPosition?.lockedAmount ? formatPizzaWei(userPosition.lockedAmount) : '0'} PIZZA
                          </div>
                        </button>
                      </div>
                    </div>
                    {unstakeLockType === 1 && isLocked && (
                      <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                        <p className="text-red-700 text-sm font-bold flex items-center gap-1">
                          <AlertTriangle size={14} />
                          15% Early Unstake Penalty
                        </p>
                        <p className="text-red-600 text-xs mt-1">
                          Lock period not finished. You will lose 15% of unstaked amount.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowConfirmModal(null)}
                      className="flex-1 !bg-gray-300 hover:!bg-gray-400 text-gray-700 font-bold py-2 rounded-xl"
                      disabled={isWritePending || isConfirming}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUnstake}
                      className="flex-1 !bg-red-500 hover:!bg-red-600 text-white font-bold py-2 rounded-xl"
                      disabled={isWritePending || isConfirming || !unstakeAmount || parseFloat(unstakeAmount) <= 0 || isBanned}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'Unstake'
                      )}
                    </Button>
                  </div>
                </>
              )}

            </Card>
          </div>
        )}

        {/* SPIN & CLAIM Modal - Full Screen Overlay (cannot be closed by clicking outside) */}
        {showConfirmModal === 'spin-claim' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div
              className="bg-black rounded-2xl p-4 border-4 border-red-800 max-w-md w-full max-h-[90vh] overflow-y-auto relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowConfirmModal(null)}
                className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors z-10"
              >
                <X size={18} className="text-gray-700" />
              </button>

              {/* Title */}
              <p
                className="text-center mb-3"
                style={{
                  fontFamily: 'var(--font-luckiest-guy)',
                  fontSize: '44px',
                  lineHeight: '1',
                  color: '#FFA500',
                  textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)'
                }}
              >
                SPIN THE PIE
              </p>

              {/* Pending Rewards Display */}
              <div className="bg-yellow-500/20 rounded-xl p-3 mb-2 border-2 border-yellow-500">
                <p className="text-yellow-400 text-sm text-center" style={customFontStyle}>
                  Rewards: <span className="text-white font-bold">{formatPizzaWei(baseRewardOnly)} PIZZA</span>
                </p>
              </div>

              {/* Explanation Text */}
              <p
                className="text-center text-sm mb-4 px-2"
                style={{
                  fontFamily: 'var(--font-luckiest-guy)',
                  color: '#FDE047',
                  textShadow: '2px 2px 0px #8B0000, 3px 3px 0px rgba(139, 0, 0, 0.5)'
                }}
              >
                Spin the Pie to grab up to 3x your daily rewards, and a chance to win 10M $Pizza for a gold sliced Jackpot spin!
              </p>

              {/* Wheel Container */}
              <div className="relative mx-auto mb-4" style={{ width: 260, height: 260 }}>
                {/* Outer Ring (static - contains pointer at top, layered on top of wheel) */}
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Image
                    src="/images/Pizza-Ring.png"
                    alt="Spin Ring"
                    width={260}
                    height={260}
                    priority
                  />
                </div>

                {/* Pizza Wheel (spins inside the ring) */}
                <div
                  ref={wheelRef}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `rotate(${spinRotation}deg)`,
                    transitionProperty: 'transform',
                    transitionDuration: isSpinning ? '3s' : '0s',
                    transitionTimingFunction: 'cubic-bezier(0.17, 0.67, 0.12, 0.99)',
                  }}
                >
                  <Image
                    src="/images/pizza_wheel.png"
                    alt="Pizza Wheel"
                    width={232}
                    height={232}
                    priority
                  />
                </div>
              </div>

              {/* Pre-spin: Show SPIN button (first spin OR second spin in double mode) */}
              {((!hasSpunThisGame && !hasClaimedThisGame) || awaitingSecondSpin) && !isSpinning && spinEnabled && canSpinToday && (
                <Button
                  onClick={handleSpin}
                  disabled={pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming || isBanned}
                  className={`w-full ${awaitingSecondSpin ? '!bg-orange-500 hover:!bg-orange-600 border-orange-700 animate-pulse' : '!bg-yellow-500 hover:!bg-yellow-600 border-yellow-700'} text-white font-bold py-3 rounded-xl border-4 disabled:opacity-50`}
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 20 }}
                >
                  {(pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming) ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={20} />
                      {isRecordSpinConfirming ? 'CONFIRMING...' : 'RECORDING SPIN...'}
                    </span>
                  ) : awaitingSecondSpin ? (
                    '🍕 SPIN AGAIN! 🍕'
                  ) : (
                    'SPIN THE PIE!'
                  )}
                </Button>
              )}

              {/* Spin 1 result shown while awaiting spin 2 */}
              {awaitingSecondSpin && spinResult && !isSpinning && (
                <div className="bg-gray-800 rounded-xl p-2 text-center border-2 border-orange-500">
                  <p className="text-orange-400 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Spin 1 Result:</p>
                  <p className="text-white text-sm font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    {spinResult.name} ({spinResult.multiplier})
                  </p>
                  <p className="text-yellow-400 text-xs mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    Double Spin Active — Spin again to add to your rewards!
                  </p>
                </div>
              )}

              {/* During spin */}
              {isSpinning && (
                <div className="text-center">
                  <p className="text-yellow-400 text-xl" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>SPINNING...</p>
                </div>
              )}

              {/* Post-spin: Show result + lock selection + claim button (only after all tier-gated spins are done) */}
              {allSpinsDoneToday && !isSpinning && spinResult && rewardBreakdown && (
                <div className="space-y-4 relative">

                  {/* JACKPOT CELEBRATION OVERLAY */}
                  {rewardBreakdown.isJackpot && (
                    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-xl">
                      {/* Pizza slice rain */}
                      {Array.from({ length: 12 }).map((_, i) => (
                        <span
                          key={i}
                          className="absolute text-2xl animate-pizza-rain"
                          style={{
                            left: `${(i * 8.3) + Math.random() * 5}%`,
                            animationDelay: `${i * 0.3}s`,
                            animationDuration: `${2 + Math.random() * 1.5}s`,
                          }}
                        >
                          🍕
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Spin Result Header */}
                  {rewardBreakdown.isJackpot ? (
                    <div className="rounded-xl p-4 text-center text-white border-4 border-yellow-400 animate-jackpot-glow"
                      style={{
                        background: 'linear-gradient(135deg, #065f46, #047857, #10b981)',
                        boxShadow: '0 8px 32px rgba(234, 88, 12, 0.6), 0 4px 16px rgba(220, 38, 38, 0.4)',
                      }}>
                      <p className="text-3xl mb-1">🏆🍕🏆</p>
                      <p className="font-bold text-sm text-green-200 uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                        Congratulations!
                      </p>
                      <p className="font-bold text-3xl text-yellow-300" style={{ fontFamily: 'var(--font-luckiest-guy)', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                        JACKPOT!
                      </p>
                      <p className="text-lg text-yellow-200 mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                        {spinResult.multiplier} Spin Multiplier
                      </p>
                      <p className="text-xl text-yellow-100 font-bold mt-1 animate-pulse" style={{ fontFamily: 'var(--font-luckiest-guy)', textShadow: '0 0 10px rgba(250, 204, 21, 0.6)' }}>
                        + 10,000,000 PIZZA Bonus!
                      </p>
                    </div>
                  ) : (
                    <div className={`${spinResult.color} rounded-xl p-3 text-center text-white border-4 border-white/30`}>
                      <p className="font-bold text-2xl" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{spinResult.name}!</p>
                      <p className="text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{spinResult.multiplier} spin multiplier</p>
                    </div>
                  )}

                  {/* Reward Breakdown */}
                  <div className={`bg-gray-900 rounded-xl p-3 border-2 ${rewardBreakdown.isJackpot ? 'border-yellow-500' : 'border-gray-700'}`}>
                    <p className="text-yellow-400 font-bold text-sm mb-2 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      Reward Breakdown
                    </p>
                    <div className="space-y-1 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      {/* Spin Result(s) */}
                      <div className="flex justify-between text-white">
                        <span>{spinResult2 ? 'Spin 1' : 'Spin Result'} ({spinResult.multiplier})</span>
                        <span className="font-bold">{formatPizzaWei(rewardBreakdown.spunReward)} PIZZA</span>
                      </div>

                      {/* Spin 1 Jackpot Bonus */}
                      {spinResult.name === 'JACKPOT' && (
                        <div className="flex justify-between text-yellow-300 text-sm animate-pulse">
                          <span>🏆 Jackpot Bonus</span>
                          <span className="font-bold">+10M PIZZA</span>
                        </div>
                      )}

                      {/* Spin 2 Result (double spin mode) */}
                      {spinResult2 && (
                        <>
                          <div className="flex justify-between text-orange-300">
                            <span>Spin 2 ({spinResult2.multiplier})</span>
                            <span className="font-bold">{formatPizzaWei(rewardBreakdown.spunReward2 || 0n)} PIZZA</span>
                          </div>
                          {spinResult2.name === 'JACKPOT' && (
                            <div className="flex justify-between text-yellow-300 text-sm animate-pulse">
                              <span>🏆 Jackpot Bonus (Spin 2)</span>
                              <span className="font-bold">+10M PIZZA</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Bonuses Section */}
                      <div className="border-t border-gray-700 pt-1 mt-1">
                        <p className="text-gray-400 text-xs mb-1">Bonuses Applied:</p>

                        {/* Tier Bonus */}
                        <div className="flex justify-between text-green-400 text-xs">
                          <span>{currentTier.emoji} {currentTier.name} ({rewardBreakdown.tierBonus})</span>
                          <span>+{(rewardBreakdown.tierBonusBPS / 100).toFixed(1)}%</span>
                        </div>

                        {/* Lock Bonus */}
                        {rewardBreakdown.hasLock && (
                          <div className="flex justify-between text-blue-400 text-xs">
                            <span>7-Day Lock Bonus</span>
                            <span>+5%</span>
                          </div>
                        )}

                        {/* Early Boost */}
                        {rewardBreakdown.hasEarlyBoost && (
                          <div className="flex justify-between text-purple-400 text-xs">
                            <span>Early Staker Boost</span>
                            <span>+30%</span>
                          </div>
                        )}

                        {/* APY Reward (dynamic %) */}
                        {rewardBreakdown.apyReward > 0n && (
                          <div className="flex justify-between text-cyan-400 text-xs">
                            <span>Locked Staking APY ({apyPercent}%)</span>
                            <span>+{formatPizzaWei(rewardBreakdown.apyReward)} PIZZA</span>
                          </div>
                        )}

                        {/* Total Bonus Amount */}
                        <div className="flex justify-between text-yellow-300 text-xs pt-1">
                          <span>Total Bonuses (+{(rewardBreakdown.totalBonusBPS / 100).toFixed(1)}%)</span>
                          <span>+{formatPizzaWei(rewardBreakdown.bonusAmount)} PIZZA</span>
                        </div>
                      </div>

                      {/* Grand Total */}
                      <div className="border-t-2 border-yellow-500 pt-2 mt-2">
                        <div className="flex justify-between text-yellow-400">
                          <span className="font-bold text-base" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>TOTAL</span>
                          <span className={`font-bold text-base ${rewardBreakdown.isJackpot ? 'text-yellow-300 animate-pulse' : ''}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            {formatPizzaWei(rewardBreakdown.totalReward)} PIZZA
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stake Lock Type Selection */}
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-white text-sm font-bold mb-2 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      Stake Lock Type
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setClaimLockType(0)}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          claimLockType === 0
                            ? 'border-green-500 bg-green-900/50'
                            : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <Unlock size={20} className={claimLockType === 0 ? 'text-green-400 mx-auto' : 'text-gray-400 mx-auto'} />
                        <p className={`font-bold text-sm mt-1 ${claimLockType === 0 ? 'text-green-400' : 'text-gray-400'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                          FLEXIBLE
                        </p>
                        <p className={`text-xs ${claimLockType === 0 ? 'text-green-300' : 'text-gray-500'}`}>
                          No lock bonus
                        </p>
                      </button>
                      <button
                        onClick={() => setClaimLockType(1)}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          claimLockType === 1
                            ? 'border-blue-500 bg-blue-900/50'
                            : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <Lock size={20} className={claimLockType === 1 ? 'text-blue-400 mx-auto' : 'text-gray-400 mx-auto'} />
                        <p className={`font-bold text-sm mt-1 ${claimLockType === 1 ? 'text-blue-400' : 'text-gray-400'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                          7-DAY LOCK
                        </p>
                        <p className={`text-xs ${claimLockType === 1 ? 'text-blue-300' : 'text-gray-500'}`}>
                          +5% bonus
                        </p>
                        <p className={`text-xs ${claimLockType === 1 ? 'text-cyan-400' : 'text-gray-500'}`}>
                          +{apyPercent}% APY
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons - WALLET (claim to wallet) or STAKE (restake) or TIP (route to vault) */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        // Claim rewards directly to wallet (use claimAfterSpin since spin already recorded)
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'claimAfterSpin',
                        })
                      }}
                      className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-3 rounded-xl border-2 border-green-700"
                      disabled={isWritePending || isConfirming || isBanned}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'WALLET'
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        // Restake rewards with selected lock type (claimLockType: 0=flexible, 1=locked)
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'restake',
                          args: [claimLockType],
                        })
                      }}
                      className="flex-1 !bg-red-500 hover:!bg-red-600 text-white font-bold py-3 rounded-xl border-2 border-red-700"
                      disabled={isWritePending || isConfirming || isBanned}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'STAKE'
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        // TIP: route rewards into the user's tipping vault balance.
                        // Requires a valid Farcaster FID (needed for Farcaster reply→tip flow).
                        if (!canTip(userFid)) return
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'claimToTip',
                        })
                      }}
                      className="flex-1 !bg-purple-500 hover:!bg-purple-600 text-white font-bold py-3 rounded-xl border-2 border-purple-700"
                      disabled={isWritePending || isConfirming || isBanned}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'TIP'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Already claimed this game - show "already spun" message */}
              {hasClaimedThisGame && !isSpinning && spinStorageChecked && (
                <div className="bg-gray-800 rounded-xl p-4 text-center border-2 border-gray-600">
                  <p className="text-gray-300 font-bold text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    You&apos;ve already spun today!
                  </p>
                  <p className="text-gray-400 text-sm mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    Come back after the next daily game settles to spin again
                  </p>
                </div>
              )}

              {/* No spin available - direct claim (only show after localStorage check) */}
              {(!spinEnabled || !canSpinToday) && !hasSpunThisGame && !hasClaimedThisGame && spinStorageChecked && (
                <div className="space-y-4">
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-400 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      {!canSpinToday ? "You've already spun today!" : "Spin is currently disabled"}
                    </p>
                  </div>

                  {/* Reward Breakdown - show even without spin result */}
                  {rewardBreakdown && (
                    <div className="bg-gray-900 rounded-xl p-3 border-2 border-gray-700">
                      <p className="text-yellow-400 font-bold text-sm mb-2 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                        Reward Breakdown
                      </p>
                      <div className="space-y-1 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                        {/* Base Rewards */}
                        <div className="flex justify-between text-white">
                          <span>Base Rewards</span>
                          <span className="font-bold">{formatPizzaWei(rewardBreakdown.spunReward)} PIZZA</span>
                        </div>

                        {/* Bonuses Section */}
                        <div className="border-t border-gray-700 pt-1 mt-1">
                          <p className="text-gray-400 text-xs mb-1">Bonuses Applied:</p>

                          {/* Tier Bonus */}
                          <div className="flex justify-between text-green-400 text-xs">
                            <span>{currentTier.emoji} {currentTier.name} ({rewardBreakdown.tierBonus})</span>
                            <span>+{(rewardBreakdown.tierBonusBPS / 100).toFixed(1)}%</span>
                          </div>

                          {/* Lock Bonus */}
                          {rewardBreakdown.hasLock && (
                            <div className="flex justify-between text-blue-400 text-xs">
                              <span>7-Day Lock Bonus</span>
                              <span>+5%</span>
                            </div>
                          )}

                          {/* Early Boost */}
                          {rewardBreakdown.hasEarlyBoost && (
                            <div className="flex justify-between text-purple-400 text-xs">
                              <span>Early Staker Boost</span>
                              <span>+30%</span>
                            </div>
                          )}

                          {/* APY Reward */}
                          {rewardBreakdown.apyReward > 0n && (
                            <div className="flex justify-between text-cyan-400 text-xs">
                              <span>Locked Staking APY ({apyPercent}%)</span>
                              <span>+{formatPizzaWei(rewardBreakdown.apyReward)} PIZZA</span>
                            </div>
                          )}
                        </div>

                        {/* Total */}
                        <div className="border-t border-gray-700 pt-1 mt-1">
                          <div className="flex justify-between text-yellow-400">
                            <span className="font-bold">TOTAL</span>
                            <span className="font-bold">{formatPizzaWei(rewardBreakdown.totalReward)} PIZZA</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stake Lock Type Selection */}
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-white text-sm font-bold mb-2 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      Stake Lock Type
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setClaimLockType(0)}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          claimLockType === 0
                            ? 'border-green-500 bg-green-900/50'
                            : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <Unlock size={20} className={claimLockType === 0 ? 'text-green-400 mx-auto' : 'text-gray-400 mx-auto'} />
                        <p className={`font-bold text-sm mt-1 ${claimLockType === 0 ? 'text-green-400' : 'text-gray-400'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                          FLEXIBLE
                        </p>
                        <p className={`text-xs ${claimLockType === 0 ? 'text-green-300' : 'text-gray-500'}`}>
                          No lock bonus
                        </p>
                      </button>
                      <button
                        onClick={() => setClaimLockType(1)}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          claimLockType === 1
                            ? 'border-blue-500 bg-blue-900/50'
                            : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <Lock size={20} className={claimLockType === 1 ? 'text-blue-400 mx-auto' : 'text-gray-400 mx-auto'} />
                        <p className={`font-bold text-sm mt-1 ${claimLockType === 1 ? 'text-blue-400' : 'text-gray-400'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                          7-DAY LOCK
                        </p>
                        <p className={`text-xs ${claimLockType === 1 ? 'text-blue-300' : 'text-gray-500'}`}>
                          +5% bonus
                        </p>
                        <p className={`text-xs ${claimLockType === 1 ? 'text-cyan-400' : 'text-gray-500'}`}>
                          +{apyPercent}% APY
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons - WALLET (claim to wallet) or STAKE (restake) or TIP (route to vault) */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        // Claim rewards directly to wallet (use claimAfterSpin since spin already recorded)
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'claimAfterSpin',
                        })
                      }}
                      className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-3 rounded-xl border-2 border-green-700"
                      disabled={isWritePending || isConfirming || isBanned}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'WALLET'
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        // Restake rewards with selected lock type (claimLockType: 0=flexible, 1=locked)
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'restake',
                          args: [claimLockType],
                        })
                      }}
                      className="flex-1 !bg-red-500 hover:!bg-red-600 text-white font-bold py-3 rounded-xl border-2 border-red-700"
                      disabled={isWritePending || isConfirming || isBanned}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'STAKE'
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        // TIP: route rewards into the user's tipping vault balance.
                        // Requires a valid Farcaster FID (needed for Farcaster reply→tip flow).
                        if (!canTip(userFid)) return
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'claimToTip',
                        })
                      }}
                      className="flex-1 !bg-purple-500 hover:!bg-purple-600 text-white font-bold py-3 rounded-xl border-2 border-purple-700"
                      disabled={isWritePending || isConfirming || isBanned}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'TIP'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Loading state while checking localStorage */}
              {!canSpinToday && !hasSpunThisGame && !spinStorageChecked && (
                <div className="text-center py-4">
                  <Loader2 className="animate-spin mx-auto text-yellow-400" size={24} />
                  <p className="text-gray-400 text-sm mt-2" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    Loading your spin...
                  </p>
                </div>
              )}

              {/* Spin Outcomes Legend - only show before spin */}
              {!hasSpunThisGame && !hasClaimedThisGame && !isSpinning && spinStorageChecked && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {SPIN_OUTCOMES.map((outcome) => (
                    <div
                      key={outcome.name}
                      className={`${outcome.color} rounded-lg px-2 py-1 text-center`}
                    >
                      <p className="text-white text-xs font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                        {outcome.name}
                      </p>
                      <p className="text-white/90 text-xs">
                        {outcome.multiplier} rewards
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share Cast Modal - shown after successful claim */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div
              className="bg-black rounded-2xl p-6 border-4 border-green-600 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <p
                className="text-center mb-4"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '28px', lineHeight: '1', color: '#22C55E' }}
              >
                🎉 Claim Successful!
              </p>
              <p className="text-white text-center mb-4" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                You claimed {formatPizzaWei(claimedAmount)} PIZZA
              </p>
              <p className="text-gray-400 text-sm text-center mb-6">
                Share your win with the community!
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowShareModal(false)}
                  className="flex-1 !bg-gray-600 hover:!bg-gray-700 text-white font-bold py-3 rounded-xl border-2 border-gray-500"
                  style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                >
                  SKIP
                </Button>
                <Button
                  onClick={handleShareCast}
                  className="flex-1 !bg-purple-500 hover:!bg-purple-600 text-white font-bold py-3 rounded-xl border-2 border-purple-700 flex items-center justify-center gap-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                >
                  <Share2 size={18} />
                  SHARE
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
