'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'

interface PizzaParlorPageProps {
  onBack?: () => void
  onNavigateToDaily?: () => void
  onNavigateToWeekly?: () => void
  onNavigateToLeaderboard?: () => void
  onNavigateToHome?: () => void
}

const PARLORS_EXPLAINED = [
  'Own a Pizza Parlor franchise for $50 PIZZA tokens',
  'Each parlor gives you 1 free daily slice to share with friends',
  'Earn 50% of owner fees distributed to all parlor owners',
  'Max 5 parlors per wallet, 100 total parlors available',
  'Send slices via direct tip or shareable links',
]

export default function PizzaParlorPage({
  onBack,
  onNavigateToDaily,
  onNavigateToWeekly,
  onNavigateToLeaderboard,
  onNavigateToHome,
}: PizzaParlorPageProps) {
  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: "bold" as const,
  }

  const [isMobile, setIsMobile] = useState(false)
  const [buyParlorOpen, setBuyParlorOpen] = useState(false)
  const [collectFeesOpen, setCollectFeesOpen] = useState(false)
  const [sendSliceOpen, setSendSliceOpen] = useState(false)

  // Mock data - replace with actual contract data later
  const parlorsOwned = 0
  const maxParlors = 5
  const totalEarned = 0.00
  const pendingFees = 0.00
  const slicesRemaining = 0

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (buyParlorOpen && !target.closest('.buy-parlor-dropdown')) {
        setBuyParlorOpen(false)
      }
      if (collectFeesOpen && !target.closest('.collect-fees-dropdown')) {
        setCollectFeesOpen(false)
      }
      if (sendSliceOpen && !target.closest('.send-slice-dropdown')) {
        setSendSliceOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [buyParlorOpen, collectFeesOpen, sendSliceOpen])

  const navigateToDaily = () => {
    if (onNavigateToDaily) onNavigateToDaily()
  }

  const navigateToWeekly = () => {
    if (onNavigateToWeekly) onNavigateToWeekly()
  }

  const navigateToLeaderboard = () => {
    if (onNavigateToLeaderboard) onNavigateToLeaderboard()
  }

  const handleBack = () => {
    if (onNavigateToHome) {
      onNavigateToHome()
    } else if (onBack) {
      onBack()
    }
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
        <Button
          onClick={handleBack}
          className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
          style={{ fontFamily: 'var(--font-luckiest-guy)' }}
        >
          <ArrowLeft size={20} />
          Back to Home
        </Button>

        <Card
          className="border-4 border-red-800 rounded-3xl shadow-2xl p-3 !bg-transparent"
          style={{
            backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="space-y-3">
            {/* Own Your Pizza Parlor Header Image */}
            <div className="relative border-4 border-black rounded-2xl overflow-hidden">
              <Image
                src="/images/Parlor-Owner.png"
                alt="Own Your Pizza Parlor"
                width={500}
                height={500}
                className="w-full h-auto block scale-[1.15]"
                priority
              />
              {/* Game ID overlay at bottom - inside the image */}
              <div className="absolute bottom-1 left-0 right-0">
                <p className="text-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '14px' }}>
                  Game ID #2
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            {/* BUY A PARLOR - Expandable */}
            <div className="buy-parlor-dropdown">
              <Button
                onClick={() => setBuyParlorOpen(!buyParlorOpen)}
                className={`w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 border-4 border-orange-800 uppercase flex items-center justify-between ${buyParlorOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              >
                <span className="flex-1 text-center">🏪 BUY A PARLOR 🏪</span>
                {buyParlorOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </Button>
              {buyParlorOpen && (
                <div className="bg-orange-100 border-4 border-t-0 border-orange-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* Parlors Owned */}
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 16 }}>Parlors Owned:</span>
                      <span className="text-orange-900" style={{ ...customFontStyle, fontSize: 16 }}>{parlorsOwned} / {maxParlors}</span>
                    </div>

                    {/* Total Earned */}
                    <div className="flex justify-between items-center">
                      <span className="text-orange-800" style={{ ...customFontStyle, fontSize: 16 }}>Total Earned:</span>
                      <span className="text-green-600" style={{ ...customFontStyle, fontSize: 16 }}>${totalEarned.toFixed(2)}</span>
                    </div>

                    {/* Buy Button */}
                    <Button
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 16 : 18 }}
                      disabled={parlorsOwned >= maxParlors}
                    >
                      {parlorsOwned >= maxParlors ? '🏪 MAX OWNED 🏪' : '🏪 BUY PARLOR - $50 🏪'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* COLLECT OWNER FEES - Expandable */}
            <div className="collect-fees-dropdown">
              <Button
                onClick={() => setCollectFeesOpen(!collectFeesOpen)}
                className={`w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 border-4 border-yellow-800 uppercase flex items-center justify-between ${collectFeesOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              >
                <span className="flex-1 text-center">💰 COLLECT OWNER FEES 💰</span>
                {collectFeesOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </Button>
              {collectFeesOpen && (
                <div className="bg-yellow-100 border-4 border-t-0 border-yellow-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* Pending Fees */}
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-800" style={{ ...customFontStyle, fontSize: 16 }}>Pending Fees:</span>
                      <span className="text-green-600" style={{ ...customFontStyle, fontSize: 16 }}>${pendingFees.toFixed(2)}</span>
                    </div>

                    {/* Collect Button */}
                    <Button
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 16 : 18 }}
                      disabled={pendingFees <= 0}
                    >
                      {pendingFees <= 0 ? '💰 NO FEES TO COLLECT 💰' : '💰 COLLECT FEES 💰'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* SEND A SLICE - Expandable */}
            <div className="send-slice-dropdown">
              <Button
                onClick={() => setSendSliceOpen(!sendSliceOpen)}
                className={`w-full !bg-blue-500 hover:!bg-blue-600 text-white font-bold py-2.5 border-4 border-blue-800 uppercase flex items-center justify-between ${sendSliceOpen ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}`}
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
              >
                <span className="flex-1 text-center">🍕 SEND A SLICE 🍕</span>
                {sendSliceOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </Button>
              {sendSliceOpen && (
                <div className="bg-blue-100 border-4 border-t-0 border-blue-800 rounded-b-xl p-4">
                  <div className="space-y-3">
                    {/* Slices Remaining */}
                    <div className="flex justify-between items-center">
                      <span className="text-blue-800" style={{ ...customFontStyle, fontSize: 16 }}>Slices Remaining Today:</span>
                      <span className="text-blue-900" style={{ ...customFontStyle, fontSize: 16 }}>{slicesRemaining}</span>
                    </div>

                    {/* Recipient Address Input */}
                    <input
                      type="text"
                      placeholder="Enter wallet address or username"
                      className="w-full p-2 rounded-xl border-2 border-blue-400 text-blue-900"
                      style={{ ...customFontStyle, fontSize: 14 }}
                    />

                    {/* Send Button */}
                    <Button
                      className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2 rounded-xl border-4 border-green-800 uppercase"
                      style={{ ...customFontStyle, fontSize: isMobile ? 16 : 18 }}
                      disabled={slicesRemaining <= 0}
                    >
                      {slicesRemaining <= 0 ? '🍕 NO SLICES LEFT 🍕' : '🍕 SEND SLICE 🍕'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={navigateToDaily}
              className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-2.5 rounded-xl border-4 border-green-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍕 GRAB A SLICE 🍕
            </Button>

            <Button
              onClick={navigateToWeekly}
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
              WEEKLY JACKPOT
              <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
            </Button>

            <Button
              onClick={navigateToLeaderboard}
              className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-2.5 rounded-xl border-4 border-red-900 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline mr-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
              LEADERBOARD
              <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline ml-1" style={{ backgroundColor: 'transparent', border: 'none' }} />
            </Button>

            {/* Parlors Explained Card */}
            <Card className="border-4 border-orange-600 rounded-2xl bg-white/95">
              <div className="px-3 pb-3 pt-1.5">
                <p className="text-orange-600 text-center mb-2" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '24px' }}>
                  Parlors Explained
                </p>
                <ul className="space-y-1.5 text-orange-800 text-sm" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                  {PARLORS_EXPLAINED.map((item, idx) => (
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
