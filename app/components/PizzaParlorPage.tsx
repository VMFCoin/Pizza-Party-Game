'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { ArrowLeft } from 'lucide-react'

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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
            <div className="border-4 border-black rounded-2xl overflow-hidden relative">
              <div className="relative w-full" style={{ aspectRatio: '1/1' }}>
                <Image
                  src="/images/Parlor-Owner.png"
                  alt="Own Your Pizza Parlor"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              {/* Game ID overlay at bottom */}
              <div className="absolute bottom-2 left-0 right-0">
                <p className="text-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '14px' }}>
                  Game ID #2
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <Button
              className="w-full !bg-orange-500 hover:!bg-orange-600 text-white font-bold py-2.5 rounded-xl border-4 border-orange-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🏪 BUY A PARLOR 🏪
            </Button>

            <Button
              className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-2.5 rounded-xl border-4 border-yellow-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              💰 COLLECT OWNER FEES 💰
            </Button>

            <Button
              className="w-full !bg-blue-500 hover:!bg-blue-600 text-white font-bold py-2.5 rounded-xl border-4 border-blue-800 uppercase"
            style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
            >
              🍕 SEND A SLICE 🍕
            </Button>

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
