'use client'

import { useState, useEffect } from 'react'

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

interface LeaderboardEntry {
  finderAddress: string | null
  finderFid: number | null
  finderName: string
  totalFinds: number
  uniqueCities: number
  uniqueCountries: number
}

function getPositionStyle(position: number) {
  if (position === 1) {
    return { bg: 'bg-gradient-to-r from-yellow-400 to-yellow-500', border: 'border-yellow-600', text: 'text-yellow-900' }
  }
  if (position === 2) {
    return { bg: 'bg-gradient-to-r from-gray-300 to-gray-400', border: 'border-gray-500', text: 'text-gray-800' }
  }
  if (position === 3) {
    return { bg: 'bg-gradient-to-r from-orange-400 to-orange-500', border: 'border-orange-600', text: 'text-orange-900' }
  }
  return { bg: 'bg-white', border: 'border-gray-300', text: 'text-gray-800' }
}

function getMedal(position: number) {
  if (position === 1) return '🥇'
  if (position === 2) return '🥈'
  if (position === 3) return '🥉'
  return `#${position}`
}

export default function StickerLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/sticker/leaderboard')
        const data = await res.json()
        if (data.success) {
          setLeaderboard(data.leaderboard)
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchLeaderboard()
  }, [])

  return (
    <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-4 shadow-2xl">
      <h3 className="text-xl text-white mb-3 text-center" style={customFontStyle}>
        Sticker Leaderboard
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-white/70 text-sm">Loading...</p>
        </div>
      ) : leaderboard.length === 0 ? (
        <p className="text-center text-white/70 text-sm py-4">
          No stickers found yet. Be the first!
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {leaderboard.map((entry, i) => {
            const pos = i + 1
            const style = getPositionStyle(pos)
            return (
              <div
                key={entry.finderAddress || entry.finderFid || i}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 ${style.bg} ${style.border}`}
              >
                <span
                  className="text-lg min-w-[36px] text-center"
                  style={{ fontFamily: 'var(--font-luckiest-guy)' }}
                >
                  {getMedal(pos)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${style.text}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    {entry.finderName}
                  </p>
                  <div className="flex gap-3 text-[10px] text-gray-600">
                    <span>{entry.uniqueCities} {entry.uniqueCities === 1 ? 'city' : 'cities'}</span>
                    <span>{entry.uniqueCountries} {entry.uniqueCountries === 1 ? 'country' : 'countries'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg ${style.text}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                    {entry.totalFinds}
                  </p>
                  <p className="text-[10px] text-gray-500">finds</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
