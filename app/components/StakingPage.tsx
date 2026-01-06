'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, Lock, Unlock, TrendingUp, Gift, Coins, AlertTriangle, Info } from 'lucide-react'

interface StakingPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToParlor?: () => void
  onNavigateToHome?: () => void
  userFid?: number | null
}

// Staking Tiers from STAKING-INSTRUCTIONS.md
const STAKING_TIERS = [
  { id: 0, name: 'Slice Runner', minStake: 0, yieldBoost: '1.0x', toppingBonus: 0, weeklyWeight: '1.0x', color: 'bg-gray-500', emoji: '🍕' },
  { id: 1, name: 'Oven Operator', minStake: 50_000_000, yieldBoost: '1.5x', toppingBonus: 1, weeklyWeight: '1.25x', color: 'bg-green-500', emoji: '🔥' },
  { id: 2, name: 'Pie Boss', minStake: 200_000_000, yieldBoost: '2.0x', toppingBonus: 3, weeklyWeight: '1.5x', color: 'bg-orange-500', emoji: '👨‍🍳' },
  { id: 3, name: 'Pizza Tycoon', minStake: 500_000_000, yieldBoost: '3.0x', toppingBonus: 5, weeklyWeight: '2.0x', color: 'bg-red-600', emoji: '👑' },
]

// Spin the Pie outcomes
const SPIN_OUTCOMES = [
  { name: 'Regular Slice', chance: '73%', multiplier: '100%', color: 'bg-yellow-400' },
  { name: 'Loaded Slice', chance: '20%', multiplier: '110%', color: 'bg-orange-400' },
  { name: 'Hot Out the Oven', chance: '5%', multiplier: '125%', color: 'bg-red-500' },
  { name: 'JACKPOT', chance: '2%', multiplier: '200%', color: 'bg-green-600' },
]

// Lock Types
const LOCK_TYPES = [
  { id: 'flexible', name: 'Flexible', multiplier: '0.5x', duration: 'No lock', penalty: 'None', icon: Unlock },
  { id: 'locked', name: '7-Day Lock', multiplier: '1.5x', duration: '7 days', penalty: '15% early exit', icon: Lock },
]

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
}

// Helper to format large numbers
const formatPizza = (amount: number): string => {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`
  return amount.toFixed(2)
}

// Get tier from staked amount
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
  userFid: _userFid,
}: StakingPageProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinRotation, setSpinRotation] = useState(0)
  const [spinResult, setSpinResult] = useState<typeof SPIN_OUTCOMES[0] | null>(null)

  // Mock staking state (will be replaced with contract reads)
  const [stakeAmount, setStakeAmount] = useState('')
  const [selectedLockType, setSelectedLockType] = useState<'flexible' | 'locked'>('locked')
  const [showStakeInput, setShowStakeInput] = useState(false)

  // Mock user position (will come from contract)
  const [userPosition, setUserPosition] = useState<{
    stakedAmount: number
    lockType: 'flexible' | 'locked'
    lockEndTime: number
    pendingRewards: number
    lastClaimTime: number
  } | null>(null)

  // Mock wallet balance
  const [walletBalance] = useState(100_000_000) // 100M PIZZA for demo

  // Early staker boost end time (60 days from launch)
  const [boostEndTime] = useState(Date.now() + 60 * 24 * 60 * 60 * 1000) // Demo: 60 days from now

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

  // Calculate days remaining for early staker boost
  const getBoostDaysRemaining = (): number => {
    const remaining = boostEndTime - Date.now()
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)))
  }

  // Demo spin animation with result
  const handleDemoSpin = () => {
    if (isSpinning) return
    setIsSpinning(true)
    setSpinResult(null)

    // Determine outcome based on chances
    const rand = Math.random() * 100
    let outcome: typeof SPIN_OUTCOMES[0]
    if (rand < 73) outcome = SPIN_OUTCOMES[0] // Regular
    else if (rand < 93) outcome = SPIN_OUTCOMES[1] // Loaded
    else if (rand < 98) outcome = SPIN_OUTCOMES[2] // Hot
    else outcome = SPIN_OUTCOMES[3] // Jackpot

    // Spin 3-5 full rotations plus a random amount
    const fullRotations = (3 + Math.random() * 2) * 360
    const extraRotation = Math.random() * 360
    setSpinRotation(prev => prev + fullRotations + extraRotation)

    setTimeout(() => {
      setIsSpinning(false)
      setSpinResult(outcome)
    }, 3000)
  }

  // Mock stake handler
  const handleStake = () => {
    const amount = parseFloat(stakeAmount) || 0
    if (amount < 100_000) {
      alert('Minimum stake is 100,000 PIZZA')
      return
    }
    if (amount > walletBalance) {
      alert('Insufficient balance')
      return
    }

    // Demo: Set position
    setUserPosition({
      stakedAmount: amount,
      lockType: selectedLockType,
      lockEndTime: selectedLockType === 'locked' ? Date.now() + 7 * 24 * 60 * 60 * 1000 : 0,
      pendingRewards: 0,
      lastClaimTime: Date.now(),
    })
    setStakeAmount('')
    setShowStakeInput(false)
  }

  // Mock unstake handler
  const handleUnstake = () => {
    if (!userPosition) return

    const isLocked = userPosition.lockType === 'locked' && userPosition.lockEndTime > Date.now()
    if (isLocked) {
      const penalty = userPosition.stakedAmount * 0.15
      if (!confirm(`Early unstake will cost you ${formatPizza(penalty)} PIZZA (15% penalty). Continue?`)) {
        return
      }
    }

    setUserPosition(null)
  }

  // Mock claim handler
  const handleClaim = () => {
    if (!userPosition || userPosition.pendingRewards <= 0) return
    handleDemoSpin()
  }

  // Get current tier
  const currentTier = userPosition ? getTierFromAmount(userPosition.stakedAmount) : STAKING_TIERS[0]

  // Calculate time until unlock
  const getTimeUntilUnlock = (): string => {
    if (!userPosition || userPosition.lockType === 'flexible') return 'Unlocked'
    const remaining = userPosition.lockEndTime - Date.now()
    if (remaining <= 0) return 'Unlocked'
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    return `${days}d ${hours}h`
  }

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
          <div className="space-y-3">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-green-700 rounded-2xl px-3 py-3 text-center border-4 border-green-900">
              <p
                className="text-white font-bold"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '32px', lineHeight: '1' }}
              >
                SPIN THE PIE
              </p>
              <p
                className="text-green-100 text-sm mt-1"
                style={{ fontFamily: 'var(--font-luckiest-guy)' }}
              >
                Stake PIZZA - Earn Rewards
              </p>
            </div>

            {/* Your Position Card */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-2 pt-1">
                {/* Early Staker Boost Banner - on top inside position card */}
                {getBoostDaysRemaining() > 0 && (
                  <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-lg px-2 py-1.5 border-2 border-yellow-600 flex items-center gap-2 mb-3">
                    <Gift className="text-yellow-800" size={16} />
                    <div className="flex-1">
                      <p className="text-yellow-900 font-bold text-xs" style={customFontStyle}>
                        EARLY STAKER BOOST ACTIVE!
                      </p>
                      <p className="text-yellow-800 text-xs">
                        +30% rewards for {getBoostDaysRemaining()} more days
                      </p>
                    </div>
                    <TrendingUp className="text-yellow-800" size={16} />
                  </div>
                )}

                <p
                  className="text-green-600 text-center mb-1.5"
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

                    {/* Position Details */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                        <div className="flex items-center gap-1 text-green-600 text-xs mb-1">
                          <Coins size={14} />
                          <span>Staked</span>
                        </div>
                        <p className="text-green-800 font-bold" style={customFontStyle}>
                          {formatPizza(userPosition.stakedAmount)} PIZZA
                        </p>
                      </div>

                      <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                        <div className="flex items-center gap-1 text-green-600 text-xs mb-1">
                          {userPosition.lockType === 'locked' ? <Lock size={14} /> : <Unlock size={14} />}
                          <span>Lock Status</span>
                        </div>
                        <p className="text-green-800 font-bold" style={customFontStyle}>
                          {getTimeUntilUnlock()}
                        </p>
                      </div>
                    </div>

                    {/* Pending Rewards */}
                    <div className="bg-yellow-50 rounded-lg p-3 border-2 border-yellow-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-yellow-700 text-xs">Pending Rewards</p>
                          <p className="text-yellow-800 font-bold text-xl" style={customFontStyle}>
                            {formatPizza(userPosition.pendingRewards)} PIZZA
                          </p>
                        </div>
                        <Button
                          onClick={handleClaim}
                          disabled={userPosition.pendingRewards <= 0 || isSpinning}
                          className="!bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 px-4 rounded-xl border-2 border-yellow-700 disabled:opacity-50"
                          style={customFontStyle}
                        >
                          {isSpinning ? 'SPINNING...' : 'CLAIM'}
                        </Button>
                      </div>
                    </div>

                    {/* Yield Multiplier Breakdown */}
                    <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                      <p className="text-gray-600 text-xs mb-1 font-bold">Your Yield Multipliers:</p>
                      <div className="flex flex-wrap gap-1 text-xs">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Tier: {currentTier.yieldBoost}
                        </span>
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Lock: {userPosition.lockType === 'locked' ? '1.5x' : '0.5x'}
                        </span>
                        {getBoostDaysRemaining() > 0 && (
                          <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            Early: +30%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unstake Button */}
                    <Button
                      onClick={handleUnstake}
                      className="w-full !bg-red-500 hover:!bg-red-600 text-white font-bold py-2 rounded-xl border-2 border-red-700"
                      style={customFontStyle}
                    >
                      {userPosition.lockType === 'locked' && userPosition.lockEndTime > Date.now() ? (
                        <span className="flex items-center justify-center gap-2">
                          <AlertTriangle size={16} />
                          UNSTAKE (15% PENALTY)
                        </span>
                      ) : (
                        'UNSTAKE'
                      )}
                    </Button>
                  </div>
                ) : (
                  // No position - Show stake interface
                  <div className="space-y-3">
                    {!showStakeInput ? (
                      <>
                        <div className="text-center py-4">
                          <p className="text-gray-500 text-sm mb-2">You have no staked position</p>
                          <p className="text-green-600 font-bold" style={customFontStyle}>
                            Wallet: {formatPizza(walletBalance)} PIZZA
                          </p>
                        </div>
                        <Button
                          onClick={() => setShowStakeInput(true)}
                          className="w-full !bg-green-500 hover:!bg-green-600 text-white font-bold py-3 rounded-xl border-4 border-green-700"
                          style={{ ...customFontStyle, fontSize: 18 }}
                        >
                          START STAKING
                        </Button>
                      </>
                    ) : (
                      <>
                        {/* Stake Amount Input */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-1" style={customFontStyle}>
                            Amount to Stake
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={stakeAmount}
                              onChange={(e) => setStakeAmount(e.target.value)}
                              placeholder="Min: 100,000 PIZZA"
                              className="flex-1 px-3 py-2 border-2 border-green-300 rounded-xl focus:border-green-500 focus:outline-none"
                            />
                            <Button
                              onClick={() => setStakeAmount(walletBalance.toString())}
                              className="!bg-green-200 hover:!bg-green-300 text-green-700 font-bold px-3 rounded-xl border-2 border-green-400"
                              style={customFontStyle}
                            >
                              MAX
                            </Button>
                          </div>
                          <p className="text-gray-500 text-xs mt-1">
                            Balance: {formatPizza(walletBalance)} PIZZA
                          </p>
                        </div>

                        {/* Preview Tier */}
                        {stakeAmount && parseFloat(stakeAmount) >= 100_000 && (
                          <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                            <p className="text-green-600 text-xs mb-1">Your tier will be:</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getTierFromAmount(parseFloat(stakeAmount)).emoji}</span>
                              <span className="text-green-800 font-bold" style={customFontStyle}>
                                {getTierFromAmount(parseFloat(stakeAmount)).name}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Lock Type Selection */}
                        <div>
                          <label className="text-green-700 text-sm font-bold block mb-2" style={customFontStyle}>
                            Lock Period
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {LOCK_TYPES.map((lockType) => {
                              const Icon = lockType.icon
                              const isSelected = selectedLockType === lockType.id
                              return (
                                <button
                                  key={lockType.id}
                                  onClick={() => setSelectedLockType(lockType.id as 'flexible' | 'locked')}
                                  className={`p-3 rounded-xl border-2 transition-all ${
                                    isSelected
                                      ? 'border-green-500 bg-green-100'
                                      : 'border-gray-200 bg-white hover:border-green-300'
                                  }`}
                                >
                                  <Icon size={20} className={isSelected ? 'text-green-600 mx-auto' : 'text-gray-400 mx-auto'} />
                                  <p className={`font-bold text-sm mt-1 ${isSelected ? 'text-green-700' : 'text-gray-600'}`} style={customFontStyle}>
                                    {lockType.name}
                                  </p>
                                  <p className={`text-xs ${isSelected ? 'text-green-600' : 'text-gray-500'}`}>
                                    Yield: {lockType.multiplier}
                                  </p>
                                  {lockType.id === 'locked' && (
                                    <p className="text-xs text-orange-500 mt-1">
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
                            onClick={handleStake}
                            disabled={!stakeAmount || parseFloat(stakeAmount) < 100_000}
                            className="flex-1 !bg-green-500 hover:!bg-green-600 text-white font-bold py-2 rounded-xl border-2 border-green-700 disabled:opacity-50"
                            style={customFontStyle}
                          >
                            STAKE
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Spin the Pie Wheel */}
            <div className="bg-white/95 rounded-2xl p-4 border-4 border-yellow-600">
              <p
                className="text-center text-yellow-700 mb-3"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '20px' }}
              >
                Spin the Pie {userPosition ? '(Claim to Spin!)' : 'Preview'}
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

              {/* Demo Spin Button (only if no position) */}
              {!userPosition && (
                <Button
                  onClick={handleDemoSpin}
                  disabled={isSpinning}
                  className="w-full mt-4 !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl border-4 border-yellow-700"
                  style={{ ...customFontStyle, fontSize: 16 }}
                >
                  {isSpinning ? 'SPINNING...' : 'DEMO SPIN'}
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
            <Card className="border-4 border-orange-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-1.5">
                <p
                  className="text-orange-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '22px' }}
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
                            style={{ ...customFontStyle, fontSize: 14 }}
                          >
                            <span>{tier.emoji}</span>
                            {tier.name}
                            {isCurrentTier && <span className="text-xs ml-1">(YOU)</span>}
                          </span>
                          <span
                            className={`text-xs ${isCurrentTier ? 'text-white/90' : 'text-orange-500'}`}
                            style={customFontStyle}
                          >
                            {tier.minStake > 0 ? `${(tier.minStake / 1_000_000).toFixed(0)}M+ PIZZA` : 'Any amount'}
                          </span>
                        </div>
                        <div className={`flex justify-between text-xs mt-1 ${isCurrentTier ? 'text-white/80' : 'text-orange-600'}`}>
                          <span>Yield: {tier.yieldBoost}</span>
                          <span>+{tier.toppingBonus} toppings/week</span>
                          <span>Weight: {tier.weeklyWeight}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            {/* Staking Stats */}
            <Card className="border-4 border-blue-500 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-2">
                <p
                  className="text-blue-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '20px' }}
                >
                  Staking Pool Stats
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs">Total Staked</p>
                    <p className="text-blue-700 font-bold" style={customFontStyle}>--</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs">Total Stakers</p>
                    <p className="text-blue-700 font-bold" style={customFontStyle}>--</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs">Daily Pot Share</p>
                    <p className="text-blue-700 font-bold" style={customFontStyle}>4%</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-blue-500 text-xs">Bonus Pool</p>
                    <p className="text-blue-700 font-bold" style={customFontStyle}>--</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* How It Works */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-1.5">
                <p
                  className="text-green-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '22px' }}
                >
                  How Staking Works
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-green-800">
                    <Coins size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Stake PIZZA tokens to earn 4% of every daily lottery pot</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800">
                    <TrendingUp size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Higher tiers = more yield boost + bonus weekly toppings</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800">
                    <Lock size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                    <span>7-day lock gives 1.5x yield (Flexible = 0.5x yield)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800">
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <span>Early unstake from locked position = 15% penalty</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800">
                    <Gift size={16} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>First 60 days: Early staker boost (+30% rewards!)</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-800">
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
      </div>
    </div>
  )
}
