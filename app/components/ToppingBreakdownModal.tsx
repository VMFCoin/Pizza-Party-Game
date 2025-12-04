'use client'

import Image from 'next/image'
import { Button } from './ui/button'
import { X } from 'lucide-react'

interface ToppingBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  dailyPlayToppings: number
  referralToppings: number
  holdingsToppings: number
  totalToppings: number
  isLoading?: boolean
  onClaim: () => void
  isMobile?: boolean
}

const customFontStyle = {
  fontFamily: '\"Comic Sans MS\", \"Marker Felt\", \"Chalkduster\", \"Kalam\", \"Caveat\"',
  fontWeight: 'bold' as const,
}

export default function ToppingBreakdownModal({
  isOpen,
  onClose,
  dailyPlayToppings,
  referralToppings,
  holdingsToppings,
  totalToppings,
  isLoading = false,
  onClaim,
  isMobile = false,
}: ToppingBreakdownModalProps) {
  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking directly on the backdrop, not on the card
    if (e.target === e.currentTarget && !isLoading) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 cursor-pointer"
      onClick={handleBackdropClick}
    >
      <div className={`bg-white/95 backdrop-blur-md rounded-xl border-4 border-black cursor-default ${
        isMobile ? 'p-3 w-full' : 'p-4 max-w-md'
      }`} style={{ borderColor: '#000000' }}>
        <div className="flex items-center justify-center mb-1 relative">
          <p className={`text-red-700 font-bold text-center ${isMobile ? 'text-base' : 'text-lg'}`} style={customFontStyle}>
            🍕 TOPPINGS EARNED 🍕
          </p>
          <div className="flex items-center gap-3 absolute right-0">
            <span className={`text-red-700 font-black ${isMobile ? 'text-2xl' : 'text-3xl'}`} style={customFontStyle}>
              {totalToppings}
            </span>
            <button
              onClick={onClose}
              className="text-black hover:text-gray-700 transition-colors"
              disabled={isLoading}
            >
              <X size={isMobile ? 18 : 20} />
            </button>
          </div>
        </div>
        <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-red-500 mb-3 text-center`}>
          See how many toppings you&apos;ve earned this week
        </p>

        <div className={`${isMobile ? 'space-y-2 mb-4' : 'space-y-3 mb-6'}`}>
          {/* Daily Plays */}
          <div className={`flex justify-between items-center bg-gradient-to-r from-blue-400 to-blue-500 rounded-xl border-2 border-blue-600 ${isMobile ? 'p-2' : 'p-3'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <Image src="/images/pepperoni-art.png" alt="Daily Plays" width={isMobile ? 20 : 24} height={isMobile ? 20 : 24} />
              <span className={`text-black font-bold truncate ${isMobile ? 'text-sm' : ''}`} style={customFontStyle}>
                Daily Plays
              </span>
            </div>
            <span className={`text-black font-black flex-shrink-0 ${isMobile ? 'text-base' : 'text-lg'}`}>{dailyPlayToppings}</span>
          </div>

          {/* Referrals */}
          <div className={`flex justify-between items-center bg-gradient-to-r from-green-400 to-green-500 rounded-xl border-2 border-green-600 ${isMobile ? 'p-2' : 'p-3'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <Image src="/images/mushroom-icon2.png" alt="Referrals" width={isMobile ? 20 : 24} height={isMobile ? 20 : 24} />
              <span className={`text-black font-bold truncate ${isMobile ? 'text-sm' : ''}`} style={customFontStyle}>
                Referrals
              </span>
            </div>
            <span className={`text-black font-black flex-shrink-0 ${isMobile ? 'text-base' : 'text-lg'}`}>{referralToppings}</span>
          </div>

          {/* Holdings Bonus */}
          <div className={`flex justify-between items-center bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl border-2 border-yellow-600 ${isMobile ? 'p-2' : 'p-3'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`${isMobile ? 'text-lg' : 'text-2xl'}`}>🍅</span>
              <span className={`text-black font-bold truncate ${isMobile ? 'text-sm' : ''}`} style={customFontStyle}>
                VMF Holdings
              </span>
            </div>
            <span className={`text-black font-black flex-shrink-0 ${isMobile ? 'text-base' : 'text-lg'}`}>{holdingsToppings}</span>
          </div>
        </div>

        {/* Claim Button */}
        <div className="w-full">
          <Button
            className={`!bg-red-600 hover:!bg-red-700 text-white font-bold rounded-lg w-full border-4 border-red-800 uppercase ${isMobile ? 'py-2' : 'py-2'}`}
            style={{ ...customFontStyle, fontSize: isMobile ? 16 : 20 }}
            onClick={onClaim}
            disabled={isLoading || totalToppings === 0}
          >
            {isLoading ? (
              'Processing...'
            ) : (
              <>
                <span className={`${isMobile ? 'text-lg' : 'text-xl'}`}>🍕</span> CLAIM TOPPINGS <span className={`${isMobile ? 'text-lg' : 'text-xl'}`}>🍕</span>
              </>
            )}
          </Button>
        </div>

        <p className={`${isMobile ? 'text-xs' : 'text-xs'} text-red-500 text-center ${isMobile ? 'mt-2' : 'mt-3'}`}>
          Claimed toppings enter you into the Weekly Jackpot drawing, good luck.
        </p>
      </div>
    </div>
  )
}
