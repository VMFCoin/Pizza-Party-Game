'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'

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
  { id: 0, name: 'Slice Runner', minStake: 0, yieldBoost: '1.0x', toppingBonus: '+0/week', weeklyWeight: '1.0x' },
  { id: 1, name: 'Oven Operator', minStake: 50_000_000, yieldBoost: '1.5x', toppingBonus: '+1/week', weeklyWeight: '1.25x' },
  { id: 2, name: 'Pie Boss', minStake: 200_000_000, yieldBoost: '2.0x', toppingBonus: '+3/week', weeklyWeight: '1.5x' },
  { id: 3, name: 'Pizza Tycoon', minStake: 500_000_000, yieldBoost: '3.0x', toppingBonus: '+5/week', weeklyWeight: '2.0x' },
]

// Spin the Pie outcomes
const SPIN_OUTCOMES = [
  { name: 'Regular Slice', chance: '73%', multiplier: '100%', color: 'bg-yellow-400' },
  { name: 'Loaded Slice', chance: '20%', multiplier: '110%', color: 'bg-orange-400' },
  { name: 'Hot Out the Oven', chance: '5%', multiplier: '125%', color: 'bg-red-500' },
  { name: 'JACKPOT', chance: '2%', multiplier: '200%', color: 'bg-green-600' },
]

const STAKING_EXPLAINED = [
  'Stake PIZZA to earn 4% of daily lottery pot',
  'Higher tiers = more yield + bonus toppings',
  '7-day lock gives 1.5x yield multiplier',
  'Flexible staking = 0.5x yield (no lock)',
  'Early unstake penalty: 15% of staked amount',
  'First 60 days: +30% early staker boost!',
  'Spin the Pie when claiming for bonus rewards',
]

const customFontStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
  fontWeight: 'bold' as const,
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

  // Demo spin animation
  const handleDemoSpin = () => {
    if (isSpinning) return
    setIsSpinning(true)
    // Spin 3-5 full rotations plus a random amount
    const fullRotations = (3 + Math.random() * 2) * 360
    const extraRotation = Math.random() * 360
    setSpinRotation(prev => prev + fullRotations + extraRotation)
    setTimeout(() => {
      setIsSpinning(false)
    }, 3000)
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

            {/* Spin the Pie Wheel */}
            <div className="bg-white/95 rounded-2xl p-4 border-4 border-yellow-600">
              <p
                className="text-center text-yellow-700 mb-3"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '20px' }}
              >
                Spin the Pie Preview
              </p>

              {/* Wheel Container */}
              <div className="relative mx-auto" style={{ width: isMobile ? 240 : 300, height: isMobile ? 240 : 300 }}>
                {/* Outer Ring (static - behind) */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Image
                    src="/images/Spin-Ring.png"
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
                    src="/images/Pizza Wheel.png"
                    alt="Pizza Wheel"
                    width={isMobile ? 190 : 240}
                    height={isMobile ? 190 : 240}
                    priority
                  />
                </div>
              </div>

              {/* Demo Spin Button */}
              <Button
                onClick={handleDemoSpin}
                disabled={isSpinning}
                className="w-full mt-4 !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2 rounded-xl border-4 border-yellow-700"
                style={{ ...customFontStyle, fontSize: 16 }}
              >
                {isSpinning ? '🍕 SPINNING... 🍕' : '🍕 DEMO SPIN 🍕'}
              </Button>

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
                  {STAKING_TIERS.map((tier) => (
                    <div
                      key={tier.id}
                      className="bg-orange-50 border-2 border-orange-300 rounded-lg p-2"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className="text-orange-700 font-bold"
                          style={{ ...customFontStyle, fontSize: 14 }}
                        >
                          {tier.name}
                        </span>
                        <span
                          className="text-orange-500 text-xs"
                          style={customFontStyle}
                        >
                          {tier.minStake > 0 ? `${(tier.minStake / 1_000_000).toFixed(0)}M+ PIZZA` : 'Any amount'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-orange-600 mt-1">
                        <span>Yield: {tier.yieldBoost}</span>
                        <span>Toppings: {tier.toppingBonus}</span>
                        <span>Weight: {tier.weeklyWeight}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Coming Soon Notice */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl px-4 py-3 text-center border-4 border-red-700">
              <p
                className="text-white font-bold"
                style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px' }}
              >
                COMING SOON
              </p>
              <p
                className="text-white/90 text-sm mt-1"
                style={{ fontFamily: 'var(--font-luckiest-guy)' }}
              >
                Staking launches with new PIZZA token
              </p>
            </div>

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
              🍍 OWN A PARLOR 🍍
            </Button>

            {/* Staking Explained Card */}
            <Card className="border-4 border-green-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-1.5">
                <p
                  className="text-green-600 text-center mb-2"
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px' }}
                >
                  How Staking Works
                </p>
                <ul className="space-y-1.5 text-green-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  {STAKING_EXPLAINED.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span>🍕</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

          </div>
        </Card>
      </div>
    </div>
  )
}
