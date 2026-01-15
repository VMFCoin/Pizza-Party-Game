'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, Lock, Unlock, TrendingUp, Gift, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronUp, Share2 } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { sdk } from '@farcaster/miniapp-sdk'
import {
  PIZZA_STAKING_ADDRESS,
  PIZZA_STAKING_ABI,
  PIZZA_TOKEN_ADDRESS,
  PIZZA_TOKEN_ABI,
  PIZZA_PARTY_ADDRESS,
  PIZZA_PARTY_ABI,
} from '@/app/lib/constants'

interface StakingPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToParlor?: () => void
  onNavigateToHome?: () => void
  userFid?: number | null
  authToken?: string | null
}

// Staking Tiers - yield bonuses are ADDITIVE (not multiplicative)
// NOTE: Thresholds are for 10M supply testing. Multiply by 1000 for 10B supply.
// yieldBoostBPS: basis points for calculation (150 = 1.5%, 500 = 5%, etc.)
const STAKING_TIERS = [
  { id: 0, name: 'Slice Runner', minStake: 0, yieldBoost: '+1.5%', yieldBoostBPS: 150, toppingBonus: 0, color: 'bg-gray-500', emoji: '🍕' },
  { id: 1, name: 'Oven Operator', minStake: 50_000, yieldBoost: '+3%', yieldBoostBPS: 300, toppingBonus: 1, color: 'bg-green-500', emoji: '🔥' },
  { id: 2, name: 'Pie Boss', minStake: 200_000, yieldBoost: '+7%', yieldBoostBPS: 700, toppingBonus: 3, color: 'bg-orange-500', emoji: '👨‍🍳' },
  { id: 3, name: 'Pizza Tycoon', minStake: 500_000, yieldBoost: '+15%', yieldBoostBPS: 1500, toppingBonus: 5, color: 'bg-red-600', emoji: '👑' },
]

// Bonus constants (must match contract)
const LOCK_BONUS_BPS = 500 // +5% for locked position
const EARLY_BOOST_BPS = 3000 // +30% early staker boost

// Staking limits - MIN_STAKE is now dynamic ($1 worth of PIZZA)
// Fallback used if contract call fails (100 PIZZA)
const MIN_STAKE_FALLBACK = 100
const _MAX_STAKE = 1_000_000 // 1M PIZZA maximum (10% of supply) - enforced by contract

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
  { id: 'flexible', name: 'No Lock', bonus: '+0%', duration: 'No lock', penalty: 'None', icon: Unlock, lockType: 0 },
  { id: 'locked', name: '7-Day Lock', bonus: '+5%', duration: '7 days', penalty: '15% early exit', icon: Lock, lockType: 1 },
]

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
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

// Format with commas for exact display (3 decimal places)
const formatExact = (amount: string): string => {
  const num = parseFloat(amount)
  if (isNaN(num)) return amount
  return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

// Format wei to exact display with commas (3 decimal places)
const formatWeiExact = (amountWei: bigint | undefined): string => {
  if (!amountWei) return '0.000'
  const amount = Number(formatUnits(amountWei, 18))
  return amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
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
}: StakingPageProps) {
  const { address } = useAccount()
  const [isMobile, setIsMobile] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinRotation, setSpinRotation] = useState(0)
  const [spinResult, setSpinResult] = useState<typeof SPIN_OUTCOMES[0] | null>(null)
  const [hasSpunThisGame, setHasSpunThisGame] = useState(false) // Track if user has spun for current game (persisted)
  const [showShareModal, setShowShareModal] = useState(false) // Show share cast modal after claim
  const [claimedAmount, setClaimedAmount] = useState<bigint>(0n) // Store claimed amount for share message

  // UI state
  const [stakeAmount, setStakeAmount] = useState('')
  const [selectedLockType, setSelectedLockType] = useState<0 | 1>(1) // 0 = flexible, 1 = locked
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
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8) // Short 8ms vibration pulse
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

  // Read user's stake info from contract
  const { data: stakeInfo, refetch: refetchStakeInfo } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'getStakeInfo',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read user's lifetime claimed rewards
  const { data: lifetimeClaimed, refetch: refetchLifetimeClaimed } = useReadContract({
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

  // Read staking rewards wallet address from contract
  const { data: stakingRewardsWallet } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'stakingRewardsWallet',
  })

  // Read staking rewards wallet PIZZA balance (this is the bonus pool for extras)
  const { data: stakingWalletBalance } = useReadContract({
    address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
    abi: PIZZA_TOKEN_ABI,
    functionName: 'balanceOf',
    args: stakingRewardsWallet ? [stakingRewardsWallet] : undefined,
    query: {
      enabled: !!stakingRewardsWallet,
    },
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

  // Calculate minStake dynamically: $1 / current price
  // This ensures the minimum is always exactly $1 worth at current market price
  const minStake = useMemo(() => {
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
  const { data: lastSpinGameId } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'lastSpinGameId',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read pending APY reward for locked position
  const { data: pendingApyReward, refetch: refetchApyReward } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'getPendingApyReward',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // === CONTRACT WRITES ===

  const { writeContract, data: writeHash, isPending: isWritePending, reset: resetWrite } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  })

  // Separate writeContract hook for recordSpin to handle its own tx lifecycle
  const { writeContract: writeRecordSpin, data: recordSpinHash, isPending: isRecordSpinPending, reset: resetRecordSpin } = useWriteContract()

  const { isLoading: isRecordSpinConfirming, isSuccess: isRecordSpinConfirmed } = useWaitForTransactionReceipt({
    hash: recordSpinHash,
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

  // Get current tier from contract data
  const currentTier = useMemo(() => {
    if (!userPosition) return STAKING_TIERS[0]
    return STAKING_TIERS[userPosition.tier] || STAKING_TIERS[0]
  }, [userPosition])

  // Check if user can spin today (from contract)
  const canSpinToday = useMemo(() => {
    if (!spinEnabled) return false
    if (!currentGameId || !lastSpinGameId) return true
    return lastSpinGameId !== currentGameId
  }, [spinEnabled, currentGameId, lastSpinGameId])

  // localStorage key for persisting spin result
  const spinStorageKey = useMemo(() => {
    if (!address || !currentGameId) return null
    return `spin_result_${address}_${currentGameId}`
  }, [address, currentGameId])

  // Load persisted spin result on mount or when gameId changes
  useEffect(() => {
    if (!spinStorageKey) return

    try {
      const stored = localStorage.getItem(spinStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Find the matching outcome
        const outcome = SPIN_OUTCOMES.find(o => o.name === parsed.outcomeName)
        if (outcome) {
          setSpinResult(outcome)
          setHasSpunThisGame(true)
          setSpinRotation(parsed.rotation || 0)
        }
      } else {
        // No stored result for this game - reset state
        setSpinResult(null)
        setHasSpunThisGame(false)
      }
    } catch (e) {
      console.error('Failed to load spin result from localStorage:', e)
    }
  }, [spinStorageKey])

  // Save spin result to localStorage when spin completes
  const saveSpinResult = useCallback((outcome: typeof SPIN_OUTCOMES[0], rotation: number) => {
    if (!spinStorageKey) return
    try {
      localStorage.setItem(spinStorageKey, JSON.stringify({
        outcomeName: outcome.name,
        rotation,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.error('Failed to save spin result to localStorage:', e)
    }
  }, [spinStorageKey])

  // Clear spin result from localStorage after successful claim
  const clearSpinResult = useCallback(() => {
    if (!spinStorageKey) return
    try {
      localStorage.removeItem(spinStorageKey)
      setSpinResult(null)
      setHasSpunThisGame(false)
    } catch (e) {
      console.error('Failed to clear spin result from localStorage:', e)
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
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)))
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

  // Calculate the BASE reward (before any bonuses) for display on staking card
  // The contract's totalPendingRewards already includes bonuses, so we work backwards
  // This is what we show BEFORE spin - then bonuses get added AFTER spin for excitement
  const baseRewardOnly = useMemo(() => {
    if (!userPosition || userPosition.totalPendingRewards === 0n) return 0n

    // Calculate total bonus BPS that was applied
    let totalBonusBPS = currentTier.yieldBoostBPS // Tier bonus
    if (userPosition.lockedAmount > 0n) totalBonusBPS += LOCK_BONUS_BPS // +5% lock
    if (userPosition.isEarlyBoostActive) totalBonusBPS += EARLY_BOOST_BPS // +30% early

    // Work backwards: totalPendingRewards = baseOnly × (1 + totalBonusBPS/10000)
    // So baseOnly = totalPendingRewards × 10000 / (10000 + totalBonusBPS)
    return (userPosition.totalPendingRewards * 10000n) / (10000n + BigInt(totalBonusBPS))
  }, [userPosition, currentTier])

  // Calculate reward breakdown for display after spin
  // This mirrors the contract's _calculateBonusAmount logic
  const rewardBreakdown = useMemo(() => {
    if (!userPosition || !spinResult) return null

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

    // Now calculate spin result on base (before bonuses)
    const spinMultiplier = BigInt(spinResult.multiplierValue)
    const spunReward = (baseOnly * spinMultiplier) / 100n

    // Calculate bonuses on spun reward (bonuses apply AFTER spin)
    const bonusAmount = (spunReward * BigInt(totalBonusBPS)) / 10000n
    const totalReward = spunReward + bonusAmount + apyReward

    return {
      baseOnly,           // Raw base before any modifiers
      spinMultiplier: spinResult.multiplierValue,
      spunReward,         // After spin multiplier
      tierBonus: currentTier.yieldBoost,
      tierBonusBPS: currentTier.yieldBoostBPS,
      hasLock,
      lockBonusBPS: hasLock ? LOCK_BONUS_BPS : 0,
      hasEarlyBoost: userPosition.isEarlyBoostActive,
      earlyBoostBPS: userPosition.isEarlyBoostActive ? EARLY_BOOST_BPS : 0,
      totalBonusBPS,
      bonusAmount,        // Total bonus in PIZZA
      apyReward,          // 20% APY reward for locked position
      totalReward,        // Final total
    }
  }, [userPosition, spinResult, currentTier, pendingApyReward])

  // Refetch data after successful transaction (but not during approval->stake flow)
  useEffect(() => {
    if (isConfirmed && !pendingApproval) {
      // Small delay to ensure RPC node has the latest state after tx confirmation
      const refetchData = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        await Promise.all([
          refetchBalance(),
          refetchAllowance(),
          refetchStakeInfo(),
          refetchLifetimeClaimed(),
          refetchApyReward(),
        ])
      }
      refetchData()

      // Handle claim completion - clear spin result and show share modal
      if (showConfirmModal === 'spin-claim') {
        // Store claimed amount for share message before clearing
        if (rewardBreakdown?.totalReward) {
          setClaimedAmount(rewardBreakdown.totalReward)
        }
        // Clear localStorage spin result
        clearSpinResult()
        setClaimLockType(0)
        // Show share modal after successful claim
        setShowShareModal(true)
      }
      setShowConfirmModal(null)
      setStakeAmount('')
      setUnstakeAmount('')
      setShowStakeInput(false)
      resetWrite()
    }
  }, [isConfirmed, pendingApproval, showConfirmModal, refetchBalance, refetchAllowance, refetchStakeInfo, refetchLifetimeClaimed, refetchApyReward, resetWrite, rewardBreakdown, clearSpinResult])

  // === HANDLERS ===

  // Whitelist of FIDs allowed to stake (private testing phase)
  const STAKING_WHITELIST_FIDS = [1013491, 1060809, 963422]

  // Check staking eligibility (whitelist check using FID from miniapp SDK)
  const checkStakingEligibility = useCallback(async () => {
    // Check if user FID is in whitelist
    if (!userFid) {
      setStakingEligibility({ canStake: false, reason: 'no_fid', loading: false })
      return
    }

    if (!STAKING_WHITELIST_FIDS.includes(userFid)) {
      setStakingEligibility({ canStake: false, reason: 'not_whitelisted', loading: false })
      return
    }

    // User is whitelisted - they can stake
    setStakingEligibility({ canStake: true, loading: false })
  }, [userFid])

  useEffect(() => {
    checkStakingEligibility()
  }, [checkStakingEligibility])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    if (currentAllowance < amountWei) {
      // Approve first - mark that we're pending approval so useEffect will stake after
      setPendingApproval(true)
      writeContract({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'approve',
        args: [PIZZA_STAKING_ADDRESS as `0x${string}`, amountWei],
      })
    } else {
      // Already approved, stake directly (no pending approval needed)
      setPendingApproval(false)

      // Try to register with API (optional - on-chain is source of truth)
      if (authToken) {
        const result = await registerStakingPosition(address)
        if (!result.success) {
          console.warn('[Staking] API registration failed:', result.error)
          // Continue anyway - on-chain stake is what matters
        }
      }

      writeContract({
        address: PIZZA_STAKING_ADDRESS as `0x${string}`,
        abi: PIZZA_STAKING_ABI,
        functionName: 'stake',
        args: [amountWei, selectedLockType],
      })
    }
  }

  // After approval completes, stake (only if we were waiting for approval)
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

        // Try to register with API (optional - on-chain is source of truth)
        if (authToken) {
          const result = await registerStakingPosition(address)
          if (!result.success) {
            console.warn('[Staking] API registration failed:', result.error)
            // Continue anyway - on-chain stake is what matters
          }
        }

        resetWrite()
        writeContract({
          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
          abi: PIZZA_STAKING_ABI,
          functionName: 'stake',
          args: [amountWei, selectedLockType],
        })
      }
    }
    performStakeAfterApproval()
  }, [isConfirmed, allowance, stakeAmount, selectedLockType, showConfirmModal, address, authToken, pendingApproval, resetWrite, writeContract, registerStakingPosition, refetchAllowance])

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
    if (isSpinning || hasSpunThisGame || pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming) return

    // Call recordSpin() on contract - this prevents spinning on multiple devices
    setPendingRecordSpin(true)
    writeRecordSpin({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: PIZZA_STAKING_ABI,
      functionName: 'recordSpin',
    })
  }

  // Step 2: Run spin animation AFTER recordSpin tx confirms
  const runSpinAnimation = useCallback(() => {
    setIsSpinning(true)
    setSpinResult(null)

    // Determine outcome based on odds (73% Regular, 20% Loaded, 5% Hot, 2% Jackpot)
    const rand = Math.random() * 100
    let outcome: typeof SPIN_OUTCOMES[0]
    if (rand < 73) outcome = SPIN_OUTCOMES[0]       // Regular Slice
    else if (rand < 93) outcome = SPIN_OUTCOMES[1]  // Loaded Slice
    else if (rand < 98) outcome = SPIN_OUTCOMES[2]  // Hot Out the Oven
    else outcome = SPIN_OUTCOMES[3]                 // JACKPOT

    // Get valid slice indices for this outcome
    const validSlices = OUTCOME_TO_SLICES[outcome.name]

    // Pick a random slice from valid options (for variety when multiple exist)
    const targetSlice = validSlices[Math.floor(Math.random() * validSlices.length)]

    // Calculate deterministic rotation to land on that slice
    // Use 3-5 full spins for dramatic effect
    const fullSpins = 3 + Math.floor(Math.random() * 3)
    const targetRotation = getTargetRotation(targetSlice, fullSpins)

    // Apply rotation (additive to maintain continuous spinning feel)
    setSpinRotation(targetRotation)

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
      setSpinResult(outcome)
      setHasSpunThisGame(true)
      // Persist spin result so it survives app close/reopen
      saveSpinResult(outcome, targetRotation)
    }, 3000)
  }, [playTick, triggerHaptic, getSliceFromRotation, saveSpinResult])

  // After recordSpin tx confirms, run the spin animation
  useEffect(() => {
    if (isRecordSpinConfirmed && pendingRecordSpin) {
      setPendingRecordSpin(false)
      resetRecordSpin()
      // Now run the actual spin animation
      runSpinAnimation()
    }
  }, [isRecordSpinConfirmed, pendingRecordSpin, resetRecordSpin, runSpinAnimation])

  // Handle share cast after successful claim
  const handleShareCast = useCallback(async () => {
    const shareText = `🍕 Just claimed ${formatPizzaWei(claimedAmount)} $PIZZA rewards from Spin the Pie!\n\nStake $PIZZA, spin the wheel, and boost your rewards!\n\n🎰 Join the party`
    const shareUrl = 'https://pizza-party.lol'

    try {
      const actions = sdk.actions as {
        composeCast?: (opts?: { text?: string; embeds?: string[] }) => Promise<void>
      }
      if (typeof actions.composeCast === 'function') {
        await actions.composeCast({
          text: shareText,
          embeds: [shareUrl],
        })
      }
    } catch (err) {
      console.error('[Staking] Failed to compose cast:', err)
    }
    setShowShareModal(false)
  }, [claimedAmount])

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
                      <p className="text-yellow-900 font-bold text-xs" style={customFontStyle}>
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
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '32px', lineHeight: '1' }}
                >
                  Your Staking Position
                </p>

                {userPosition ? (
                  <div className="space-y-2">
                    {/* Compact Tier + Bonuses Row */}
                    <div className={`${currentTier.color} rounded-xl p-2 text-white`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{currentTier.emoji}</span>
                          <div>
                            <p className="font-bold text-sm" style={customFontStyle}>{currentTier.name}</p>
                            <p className="text-xs opacity-90">+{currentTier.toppingBonus} toppings/week</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{currentTier.yieldBoost}</span>
                          {userPosition.lockedAmount > 0n && <span className="bg-white/20 px-2 py-0.5 rounded text-xs">+5% Lock</span>}
                          {userPosition.isEarlyBoostActive && <span className="bg-yellow-400/30 px-2 py-0.5 rounded text-xs">+30% Boost</span>}
                        </div>
                      </div>
                    </div>

                    {/* Staked Amounts - Compact Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {userPosition.flexibleAmount > 0n && (
                        <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                          <div className="flex items-center gap-1 text-green-600 text-xs">
                            <Unlock size={12} />
                            <span>Flexible</span>
                          </div>
                          <p className="text-green-800 font-bold text-sm" style={customFontStyle}>
                            {formatPizzaWei(userPosition.flexibleAmount)}
                          </p>
                        </div>
                      )}
                      {userPosition.lockedAmount > 0n && (
                        <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                          <div className="flex items-center justify-between" style={{ fontSize: '10px' }}>
                            <div className="flex items-center gap-1 text-blue-600">
                              <Lock size={10} />
                              <span>Lock 20% APY</span>
                            </div>
                            <span className="text-blue-500">{timeUntilUnlock}</span>
                          </div>
                          <p className="text-blue-800 font-bold text-sm" style={customFontStyle}>
                            {formatPizzaWei(userPosition.lockedAmount)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Pending Rewards - Compact */}
                    <div className="bg-yellow-50 rounded-lg p-2 border-2 border-yellow-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-black text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Rewards</p>
                          <p className="text-black font-bold text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            {formatPizzaWei(baseRewardOnly)} PIZZA
                          </p>
                        </div>
                        <Button
                          onClick={() => setShowConfirmModal('spin-claim')}
                          disabled={!hasPendingRewards || isWritePending || isConfirming}
                          className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-1.5 px-3 rounded-xl border-2 border-yellow-700 disabled:opacity-50 text-sm"
                          style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                        >
                          {isWritePending || isConfirming ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            'SPIN & CLAIM'
                          )}
                        </Button>
                      </div>
                      {/* Lifetime Claimed */}
                      <div className="mt-1 pt-1 border-t border-yellow-200">
                        <p className="text-black text-xs text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                          Lifetime Claimed: {formatPizzaWei(lifetimeClaimed as bigint)} PIZZA
                        </p>
                      </div>
                    </div>

                    {/* Wallet Balance - Single Line */}
                    <div className="flex justify-between items-center text-xs bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200">
                      <span className="text-gray-500">Wallet:</span>
                      <span className="text-gray-700 font-bold" style={customFontStyle}>{formatPizzaWei(pizzaBalance as bigint)} PIZZA</span>
                    </div>

                    {/* Stake More Input (shown when showStakeInput is true) */}
                    {showStakeInput ? (
                      <div className="space-y-2 bg-green-50 rounded-lg p-3 border-2 border-green-300">
                        <p className="text-green-700 font-bold text-center" style={customFontStyle}>Add to Your Stake</p>

                        {/* Stake Amount Input */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Amount to Stake
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={stakeAmount}
                              onChange={(e) => setStakeAmount(e.target.value)}
                              placeholder={`Min: $1 (~${formatPizza(minStake)} PIZZA)`}
                              className="flex-1 px-3 py-2 border-2 border-green-300 rounded-xl focus:border-green-500 focus:outline-none"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            />
                            <Button
                              onClick={() => {
                                if (pizzaBalance) {
                                  setStakeAmount(formatUnits(pizzaBalance as bigint, 18))
                                }
                              }}
                              className="!bg-green-200 hover:!bg-green-300 text-green-700 font-bold px-3 rounded-xl border-2 border-green-400"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            >
                              MAX
                            </Button>
                          </div>
                          <p className="text-gray-500 text-xs mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                            Available: {formatWeiExact(pizzaBalance as bigint)} PIZZA
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
                                  <p className={`text-xs ${isSelected ? 'text-green-600' : 'text-gray-500'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                    Bonus: {lockType.bonus}
                                  </p>
                                  {lockType.id === 'locked' && (
                                    <p className="text-xs text-orange-500 mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                      {lockType.penalty}
                                    </p>
                                  )}
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
                            style={customFontStyle}
                          >
                            CANCEL
                          </Button>
                          <Button
                            onClick={() => setShowConfirmModal('stake')}
                            disabled={!stakeAmount || parseFloat(stakeAmount) < minStake || isWritePending || isConfirming}
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
                      /* Stake / Unstake Buttons */
                      <div className="flex gap-2">
                        <Button
                          onClick={() => setShowStakeInput(true)}
                          className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-2 rounded-xl border-2 border-green-700"
                          style={customFontStyle}
                        >
                          STAKE
                        </Button>
                        <Button
                          onClick={() => setShowConfirmModal('unstake')}
                          className="flex-1 !bg-red-500 hover:!bg-red-600 text-white font-bold py-2 rounded-xl border-2 border-red-700"
                          style={customFontStyle}
                        >
                          {isLocked ? (
                            <span className="flex items-center justify-center gap-1">
                              <AlertTriangle size={14} />
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
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={stakeAmount}
                              onChange={(e) => setStakeAmount(e.target.value)}
                              placeholder={`Min: $1 (~${formatPizza(minStake)} PIZZA)`}
                              className="flex-1 px-3 py-2 border-2 border-green-300 rounded-xl focus:border-green-500 focus:outline-none"
                              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                            />
                            <Button
                              onClick={() => {
                                if (pizzaBalance) {
                                  setStakeAmount(formatUnits(pizzaBalance as bigint, 18))
                                }
                              }}
                              className="!bg-green-200 hover:!bg-green-300 text-green-700 font-bold px-3 rounded-xl border-2 border-green-400"
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
                                  <p className={`text-xs ${isSelected ? 'text-green-600' : 'text-gray-500'}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                    Bonus: {lockType.bonus}
                                  </p>
                                  {lockType.id === 'locked' && (
                                    <p className="text-xs text-orange-500 mt-1" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                                      {lockType.penalty}
                                    </p>
                                  )}
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
                            style={customFontStyle}
                          >
                            CANCEL
                          </Button>
                          <Button
                            onClick={() => setShowConfirmModal('stake')}
                            disabled={!stakeAmount || parseFloat(stakeAmount) < minStake || isWritePending || isConfirming}
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
                <span className="flex-1 text-center">📊 STAKING TIERS</span>
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
                              className={`font-bold flex items-center gap-1 ${isCurrentTier ? 'text-white' : 'text-orange-700'}`}
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
                              {tier.minStake > 0 ? `${formatPizza(tier.minStake)}+ PIZZA` : 'Any amount'}
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
                <span className="flex-1 text-center">📈 POOL STATS</span>
                {statsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </Button>
              {statsOpen && (
                <div className="bg-blue-100 border-4 border-t-0 border-blue-800 rounded-b-xl p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Total Pool Staked</p>
                      <p className="text-blue-700 font-bold text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatWeiExact(totalStakedPool as bigint)} PIZZA</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Daily Pot Share</p>
                      <p className="text-blue-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>10%</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Bonus Pool</p>
                      <p className="text-blue-700 font-bold text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatPizzaWei(stakingWalletBalance as bigint)} PIZZA</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center border border-blue-200">
                      <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Boost Days Left</p>
                      <p className="text-blue-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{boostDaysRemaining}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* How It Works - Always Visible */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95 !py-0">
              <div className="px-3 py-2">
                <p
                  className="text-green-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px', lineHeight: '1' }}
                >
                  How Staking Works
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Minimum stake: $1 (~{formatPizza(minStake)} PIZZA)</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Stake PIZZA to earn 10% of every daily pot</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Higher tiers = more yield + bonus toppings</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>7-day lock = +5% bonus + 20% APY</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Locked stakers earn 20% APY on their locked amount</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Early unstake = 15% penalty</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Early staker boost: +30% for {boostDaysRemaining} days</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>All stakers share the pot equally</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Spin the Pie daily to claim (1x-4x multiplier)</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Can only spin once per game day</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <span className="flex-shrink-0">🍅</span>
                    <span>Max stake: 1,000,000 PIZZA per wallet</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Navigation Buttons */}
            <Button
              onClick={onNavigateToDaily}
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍕 GRAB A SLICE 🍕
            </Button>

            <Button
              onClick={onNavigateToWeekly}
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
              Weekly Jackpot
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
            </Button>

            <Button
              onClick={onNavigateToLeaderboard}
              className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
              Leaderboard
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </Button>

            <Button
              onClick={onNavigateToParlor}
              className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 rounded-xl border-4 border-orange-800 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍍 OWN A PARLOR 🍍
            </Button>
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
                      disabled={isWritePending || isConfirming}
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
                      disabled={isWritePending || isConfirming || !unstakeAmount || parseFloat(unstakeAmount) <= 0}
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
              className="bg-black rounded-2xl p-4 border-4 border-red-800 max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title */}
              <p
                className="text-center mb-3"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '36px', lineHeight: '1', color: '#FFA500' }}
              >
                Spin the Pie
              </p>

              {/* Pending Rewards Display */}
              <div className="bg-yellow-500/20 rounded-xl p-3 mb-4 border-2 border-yellow-500">
                <p className="text-yellow-400 text-sm text-center" style={customFontStyle}>
                  Rewards: <span className="text-white font-bold">{formatPizzaWei(baseRewardOnly)} PIZZA</span>
                </p>
              </div>

              {/* Wheel Container */}
              <div className="relative mx-auto mb-4" style={{ width: 260, height: 260 }}>
                {/* Outer Ring (static - contains pointer at top) */}
                <div className="absolute inset-0 flex items-center justify-center">
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
                  className="absolute inset-0 flex items-center justify-center z-10"
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

              {/* Pre-spin: Show SPIN button */}
              {!hasSpunThisGame && !isSpinning && spinEnabled && canSpinToday && (
                <Button
                  onClick={handleSpin}
                  disabled={pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming}
                  className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-3 rounded-xl border-4 border-yellow-700 disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: 20 }}
                >
                  {(pendingRecordSpin || isRecordSpinPending || isRecordSpinConfirming) ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={20} />
                      {isRecordSpinConfirming ? 'CONFIRMING...' : 'RECORDING SPIN...'}
                    </span>
                  ) : (
                    'SPIN THE PIE!'
                  )}
                </Button>
              )}

              {/* During spin */}
              {isSpinning && (
                <div className="text-center">
                  <p className="text-yellow-400 text-xl" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>SPINNING...</p>
                </div>
              )}

              {/* Post-spin: Show result + lock selection + claim button */}
              {hasSpunThisGame && !isSpinning && spinResult && rewardBreakdown && (
                <div className="space-y-4">
                  {/* Spin Result Header */}
                  <div className={`${spinResult.color} rounded-xl p-3 text-center text-white border-4 border-white/30`}>
                    <p className="font-bold text-2xl" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{spinResult.name}!</p>
                    <p className="text-lg" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{spinResult.multiplier} spin multiplier</p>
                  </div>

                  {/* Reward Breakdown */}
                  <div className="bg-gray-900 rounded-xl p-3 border-2 border-gray-700">
                    <p className="text-yellow-400 font-bold text-sm mb-2 text-center" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      Reward Breakdown
                    </p>
                    <div className="space-y-1 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      {/* Spin Result */}
                      <div className="flex justify-between text-white">
                        <span>Spin Result ({spinResult.multiplier})</span>
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

                        {/* 20% APY Reward */}
                        {rewardBreakdown.apyReward > 0n && (
                          <div className="flex justify-between text-cyan-400 text-xs">
                            <span>Locked Staking APY (20%)</span>
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
                          <span className="font-bold text-base" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatPizzaWei(rewardBreakdown.totalReward)} PIZZA</span>
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
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons - WALLET (claim to wallet) or STAKE (restake with selected lock type) */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        // Claim rewards directly to wallet
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'claim',
                        })
                      }}
                      className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-3 rounded-xl border-2 border-green-700"
                      disabled={isWritePending || isConfirming}
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
                      disabled={isWritePending || isConfirming}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'STAKE'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* No spin available - direct claim */}
              {(!spinEnabled || !canSpinToday) && !hasSpunThisGame && (
                <div className="space-y-4">
                  <div className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-gray-400 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                      {!canSpinToday ? "You've already spun today!" : "Spin is currently disabled"}
                    </p>
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
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons - WALLET (claim to wallet) or STAKE (restake with selected lock type) */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        // Claim rewards directly to wallet
                        writeContract({
                          address: PIZZA_STAKING_ADDRESS as `0x${string}`,
                          abi: PIZZA_STAKING_ABI,
                          functionName: 'claim',
                        })
                      }}
                      className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-3 rounded-xl border-2 border-green-700"
                      disabled={isWritePending || isConfirming}
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
                      disabled={isWritePending || isConfirming}
                      style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'STAKE'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Spin Outcomes Legend - only show before spin */}
              {!hasSpunThisGame && !isSpinning && (
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
