'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, Lock, Unlock, TrendingUp, Gift, Coins, AlertTriangle, Info, XCircle, Loader2 } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
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
const STAKING_TIERS = [
  { id: 0, name: 'Slice Runner', minStake: 0, yieldBoost: '+1.5%', toppingBonus: 0, color: 'bg-gray-500', emoji: '🍕' },
  { id: 1, name: 'Oven Operator', minStake: 50_000, yieldBoost: '+5%', toppingBonus: 1, color: 'bg-green-500', emoji: '🔥' },
  { id: 2, name: 'Pie Boss', minStake: 200_000, yieldBoost: '+10%', toppingBonus: 3, color: 'bg-orange-500', emoji: '👨‍🍳' },
  { id: 3, name: 'Pizza Tycoon', minStake: 500_000, yieldBoost: '+20%', toppingBonus: 5, color: 'bg-red-600', emoji: '👑' },
]

// Staking limits for 10M supply testing. Change for 10B supply.
const MIN_STAKE = 100 // 100 PIZZA minimum
const _MAX_STAKE = 1_000_000 // 1M PIZZA maximum (10% of supply) - enforced by contract

// Spin the Pie outcomes
const SPIN_OUTCOMES = [
  { name: 'Regular Slice', chance: '73%', multiplier: '100%', color: 'bg-yellow-400' },
  { name: 'Loaded Slice', chance: '20%', multiplier: '110%', color: 'bg-orange-400' },
  { name: 'Hot Out the Oven', chance: '5%', multiplier: '125%', color: 'bg-red-500' },
  { name: 'JACKPOT', chance: '2%', multiplier: '200%', color: 'bg-green-600' },
]

// Lock Types - bonuses are ADDITIVE (not multiplicative)
const LOCK_TYPES = [
  { id: 'flexible', name: 'No Lock', bonus: '+0%', duration: 'No lock', penalty: 'None', icon: Unlock, lockType: 0 },
  { id: 'locked', name: '7-Day Lock', bonus: '+10%', duration: '7 days', penalty: '15% early exit', icon: Lock, lockType: 1 },
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

  // UI state
  const [stakeAmount, setStakeAmount] = useState('')
  const [selectedLockType, setSelectedLockType] = useState<0 | 1>(1) // 0 = flexible, 1 = locked
  const [showStakeInput, setShowStakeInput] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState<'stake' | 'unstake' | 'claim' | null>(null)
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [unstakeLockType, setUnstakeLockType] = useState<0 | 1>(0)

  // Anti-sybil: Track if this FID already has a staking position
  const [stakingEligibility, setStakingEligibility] = useState<{
    canStake: boolean
    reason?: string
    existingWallet?: string
    loading: boolean
  }>({ canStake: true, loading: true })

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

  // Read bonus pool
  const { data: bonusPool } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'bonusPool',
  })

  // Read spin enabled status
  const { data: spinEnabled } = useReadContract({
    address: PIZZA_STAKING_ADDRESS as `0x${string}`,
    abi: PIZZA_STAKING_ABI,
    functionName: 'spinEnabled',
  })

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

  // === CONTRACT WRITES ===

  const { writeContract, data: writeHash, isPending: isWritePending, reset: resetWrite } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  })

  // Refetch data after successful transaction
  useEffect(() => {
    if (isConfirmed) {
      refetchBalance()
      refetchAllowance()
      refetchStakeInfo()
      setShowConfirmModal(null)
      setStakeAmount('')
      setUnstakeAmount('')
      setShowStakeInput(false)
      resetWrite()
    }
  }, [isConfirmed, refetchBalance, refetchAllowance, refetchStakeInfo, resetWrite])

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

  // Check if user can spin today
  const canSpinToday = useMemo(() => {
    if (!spinEnabled) return false
    if (!currentGameId || !lastSpinGameId) return true
    return lastSpinGameId !== currentGameId
  }, [spinEnabled, currentGameId, lastSpinGameId])

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

  // === HANDLERS ===

  // Whitelist of FIDs allowed to stake (private testing phase)
  const STAKING_WHITELIST_FIDS = [1013491, 1060809]

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
    if (isNaN(amountNum) || amountNum < MIN_STAKE) return

    const amountWei = parseUnits(stakeAmount, 18)

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    if (currentAllowance < amountWei) {
      // Approve first
      writeContract({
        address: PIZZA_TOKEN_ADDRESS as `0x${string}`,
        abi: PIZZA_TOKEN_ABI,
        functionName: 'approve',
        args: [PIZZA_STAKING_ADDRESS as `0x${string}`, amountWei],
      })
    } else {
      // Already approved, stake directly
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

  // After approval completes, stake
  useEffect(() => {
    const performStakeAfterApproval = async () => {
      if (isConfirmed && stakeAmount && showConfirmModal === 'stake') {
        const amountWei = parseUnits(stakeAmount, 18)
        const currentAllowance = allowance as bigint || 0n

        if (currentAllowance >= amountWei && address) {
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
    }
    performStakeAfterApproval()
  }, [isConfirmed, allowance, stakeAmount, selectedLockType, showConfirmModal, address, authToken, resetWrite, writeContract, registerStakingPosition])

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

  // Handle claim (includes spin if enabled)
  const handleClaim = () => {
    writeContract({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: PIZZA_STAKING_ABI,
      functionName: 'claim',
    })
  }

  // Demo spin animation (visual only)
  const handleDemoSpin = () => {
    if (isSpinning) return
    setIsSpinning(true)
    setSpinResult(null)

    const rand = Math.random() * 100
    let outcome: typeof SPIN_OUTCOMES[0]
    if (rand < 73) outcome = SPIN_OUTCOMES[0]
    else if (rand < 93) outcome = SPIN_OUTCOMES[1]
    else if (rand < 98) outcome = SPIN_OUTCOMES[2]
    else outcome = SPIN_OUTCOMES[3]

    const fullRotations = (3 + Math.random() * 2) * 360
    const extraRotation = Math.random() * 360
    setSpinRotation(prev => prev + fullRotations + extraRotation)

    setTimeout(() => {
      setIsSpinning(false)
      setSpinResult(outcome)
    }, 3000)
  }

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
                    {/* Current Tier Display */}
                    <div className={`${currentTier.color} rounded-xl p-3 text-center text-white`}>
                      <p className="text-2xl">{currentTier.emoji}</p>
                      <p className="font-bold text-lg" style={customFontStyle}>{currentTier.name}</p>
                      <p className="text-sm opacity-90">
                        Yield: {currentTier.yieldBoost} | +{currentTier.toppingBonus} toppings/week
                      </p>
                    </div>

                    {/* Position Details - Flexible */}
                    {userPosition.flexibleAmount > 0n && (
                      <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                        <div className="flex items-center gap-1 text-green-600 text-xs mb-1">
                          <Unlock size={14} />
                          <span>Flexible Stake</span>
                        </div>
                        <p className="text-green-800 font-bold" style={customFontStyle}>
                          {formatPizzaWei(userPosition.flexibleAmount)} PIZZA
                        </p>
                      </div>
                    )}

                    {/* Position Details - Locked */}
                    {userPosition.lockedAmount > 0n && (
                      <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-blue-600 text-xs mb-1">
                            <Lock size={14} />
                            <span>Locked Stake</span>
                          </div>
                          <span className="text-blue-600 text-xs">{timeUntilUnlock}</span>
                        </div>
                        <p className="text-blue-800 font-bold" style={customFontStyle}>
                          {formatPizzaWei(userPosition.lockedAmount)} PIZZA
                        </p>
                      </div>
                    )}

                    {/* Pending Rewards */}
                    <div className="bg-yellow-50 rounded-lg p-3 border-2 border-yellow-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-yellow-700 text-xs">Pending Rewards</p>
                          <p className="text-yellow-800 font-bold text-xl" style={customFontStyle}>
                            {formatPizzaWei(userPosition.totalPendingRewards)} PIZZA
                          </p>
                        </div>
                        <Button
                          onClick={() => setShowConfirmModal('claim')}
                          disabled={!hasPendingRewards || isWritePending || isConfirming}
                          className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 px-4 rounded-xl border-2 border-yellow-700 disabled:opacity-50"
                          style={customFontStyle}
                        >
                          {isWritePending || isConfirming ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : spinEnabled && canSpinToday ? (
                            'SPIN & CLAIM'
                          ) : (
                            'CLAIM'
                          )}
                        </Button>
                      </div>
                      {spinEnabled && canSpinToday && hasPendingRewards && (
                        <p className="text-yellow-600 text-xs mt-1">Spin the wheel to multiply your rewards!</p>
                      )}
                      {spinEnabled && !canSpinToday && (
                        <p className="text-yellow-600 text-xs mt-1">Already spun today - claim at 100%</p>
                      )}
                    </div>

                    {/* Yield Bonus Breakdown */}
                    <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                      <p className="text-gray-600 text-xs mb-1 font-bold">Your Yield Bonuses (Additive):</p>
                      <div className="flex flex-wrap gap-1 text-xs">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Tier: {currentTier.yieldBoost}
                        </span>
                        {userPosition.lockedAmount > 0n && (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            Lock: +10%
                          </span>
                        )}
                        {userPosition.isEarlyBoostActive && (
                          <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            Early: +30%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Balance Summary */}
                    <div className="bg-purple-50 rounded-lg p-2 border border-purple-200">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-purple-500">Available to Stake</p>
                          <p className="text-purple-700 font-bold" style={customFontStyle}>{formatWeiExact(pizzaBalance as bigint)} PIZZA</p>
                        </div>
                        <div>
                          <p className="text-purple-500">Your Total Staked</p>
                          <p className="text-purple-700 font-bold" style={customFontStyle}>{formatWeiExact(userPosition.totalStakedAmount)} PIZZA</p>
                        </div>
                      </div>
                    </div>

                    {/* Stake / Unstake Buttons */}
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
                              placeholder={`Min: ${formatPizza(MIN_STAKE)} PIZZA`}
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
                        {stakeAmount && parseFloat(stakeAmount) >= MIN_STAKE && (
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
                            disabled={!stakeAmount || parseFloat(stakeAmount) < MIN_STAKE || isWritePending || isConfirming}
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

            {/* Spin the Pie Wheel */}
            <div className="bg-black rounded-2xl p-4 border-4 border-red-800">
              <p
                className="text-center mb-3"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '48px', lineHeight: '1', color: '#FFA500' }}
              >
                Spin the Pie
              </p>

              {/* Wheel Container */}
              <div className="relative mx-auto" style={{ width: isMobile ? 240 : 300, height: isMobile ? 240 : 300 }}>
                {/* Outer Ring (static - behind) */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Image
                    src="/images/Pizza-Ring.png"
                    alt="Spin Ring"
                    width={isMobile ? 240 : 300}
                    height={isMobile ? 240 : 300}
                    priority
                  />
                </div>

                {/* Pizza Wheel (spins - on top) */}
                <div
                  className="absolute inset-0 flex items-center justify-center transition-transform z-10"
                  style={{
                    transform: `rotate(${spinRotation}deg)`,
                    transitionDuration: isSpinning ? '3s' : '0s',
                    transitionTimingFunction: 'cubic-bezier(0.17, 0.67, 0.12, 0.99)',
                  }}
                >
                  <Image
                    src="/images/Pizza-Wheel.png"
                    alt="Pizza Wheel"
                    width={isMobile ? 190 : 240}
                    height={isMobile ? 190 : 240}
                    priority
                  />
                </div>
              </div>

              {/* Spin Result */}
              {spinResult && !isSpinning && (
                <div className="bg-red-500 rounded-xl p-3 mt-3 text-center text-white border-4 border-red-700">
                  <p className="font-bold text-lg" style={customFontStyle}>{spinResult.name}!</p>
                  <p className="text-sm">You get {spinResult.multiplier} of your rewards!</p>
                </div>
              )}

              {/* Spin Button (demo mode for non-stakers) */}
              {!userPosition && (
                <Button
                  onClick={handleDemoSpin}
                  disabled={isSpinning}
                  className="w-full mt-4 !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl border-4 border-yellow-700"
                  style={{ ...customFontStyle, fontSize: 16 }}
                >
                  {isSpinning ? 'SPINNING...' : 'TRY DEMO SPIN'}
                </Button>
              )}

              {/* Spin Outcomes Legend */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {SPIN_OUTCOMES.map((outcome) => (
                  <div
                    key={outcome.name}
                    className={`${outcome.color} rounded-lg px-2 py-1 text-center`}
                  >
                    <p className="text-white text-xs font-bold" style={customFontStyle}>
                      {outcome.name}
                    </p>
                    <p className="text-white/90 text-xs">
                      {outcome.chance} | {outcome.multiplier}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Staking Tiers */}
            <Card className="border-4 border-orange-600 rounded-2xl bg-white/95 !py-0">
              <div className="px-3 py-2">
                <p
                  className="text-orange-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '32px', lineHeight: '1' }}
                >
                  Staking Tiers
                </p>
                <div className="space-y-2">
                  {STAKING_TIERS.map((tier) => {
                    const isCurrentTier = userPosition && currentTier.id === tier.id
                    return (
                      <div
                        key={tier.id}
                        className={`rounded-lg p-2 border-2 transition-all ${
                          isCurrentTier
                            ? `${tier.color} border-white text-white`
                            : 'bg-orange-50 border-orange-300'
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
            </Card>

            {/* Staking Stats */}
            <Card className="border-4 border-blue-500 rounded-2xl bg-white/95 !py-0">
              <div className="px-3 py-2">
                <p
                  className="text-blue-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '32px', lineHeight: '1' }}
                >
                  Staking Pool Stats
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Total Pool Staked</p>
                    <p className="text-blue-700 font-bold text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatWeiExact(totalStakedPool as bigint)} PIZZA</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Daily Pot Share</p>
                    <p className="text-blue-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>1%</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Bonus Pool</p>
                    <p className="text-blue-700 font-bold text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{formatWeiExact(bonusPool as bigint)} PIZZA</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>Boost Days Left</p>
                    <p className="text-blue-700 font-bold" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>{boostDaysRemaining}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* How It Works */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95 !py-0">
              <div className="px-3 py-2">
                <p
                  className="text-green-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '32px', lineHeight: '1' }}
                >
                  How Staking Works
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <Coins size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Stake PIZZA tokens to earn 1% of every daily lottery pot</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <TrendingUp size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Higher tiers = more yield boost + bonus weekly toppings</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <Lock size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <span>7-day lock adds +10% bonus (No lock = tier bonus only)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <span>Early unstake from locked position = 15% penalty</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <Gift size={16} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>First 60 days: Early staker boost (+30% rewards!)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
                    <span>Spin the Pie when claiming for bonus multipliers</span>
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
              GRAB A SLICE
            </Button>

            <Button
              onClick={onNavigateToWeekly}
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
              WEEKLY JACKPOT
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
            </Button>

            <Button
              onClick={onNavigateToLeaderboard}
              className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
              LEADERBOARD
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </Button>

            <Button
              onClick={onNavigateToParlor}
              className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 rounded-xl border-4 border-orange-800 uppercase"
              style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              OWN A PARLOR
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
                    <p className="text-green-700 text-sm">Lock Type: <span className="font-bold">{selectedLockType === 1 ? '7-Day Lock (+10%)' : 'Flexible'}</span></p>
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
                      <input
                        type="number"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        placeholder="Amount"
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1">From Position</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setUnstakeLockType(0)}
                          className={`flex-1 py-2 rounded-lg border-2 ${unstakeLockType === 0 ? 'bg-green-100 border-green-500' : 'border-gray-300'}`}
                        >
                          Flexible
                        </button>
                        <button
                          onClick={() => setUnstakeLockType(1)}
                          className={`flex-1 py-2 rounded-lg border-2 ${unstakeLockType === 1 ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
                        >
                          Locked
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

              {showConfirmModal === 'claim' && (
                <>
                  <p className="text-xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    Claim Rewards
                  </p>
                  <div className="bg-yellow-50 rounded-lg p-3 mb-4">
                    <p className="text-yellow-700 text-sm">
                      Pending Rewards: <span className="font-bold">{userPosition ? formatPizzaWei(userPosition.totalPendingRewards) : '0'} PIZZA</span>
                    </p>
                    {spinEnabled && canSpinToday && (
                      <p className="text-yellow-600 text-xs mt-2">
                        Spin the wheel to multiply your rewards!
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
                      onClick={handleClaim}
                      className="flex-1 !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl"
                      disabled={isWritePending || isConfirming}
                    >
                      {isWritePending || isConfirming ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : (
                        'Claim'
                      )}
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
