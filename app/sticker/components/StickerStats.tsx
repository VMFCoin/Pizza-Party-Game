'use client'

import { useState, useEffect } from 'react'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { STICKER_REGISTRY_ABI, STICKER_REGISTRY_ADDRESS } from '../lib/stickerRegistryAbi'

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

interface Stats {
  totalFinds: number
  totalFinders: number
  totalCities: number
  totalCountries: number
}

interface OnChainStats {
  totalFinds: number
  uniqueFinders: number
}

export default function StickerStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [onChainStats, setOnChainStats] = useState<OnChainStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch DB stats
        const res = await fetch('/api/sticker/leaderboard')
        const data = await res.json()
        if (data.success) {
          setStats(data.stats)
        }

        // Fetch on-chain stats
        if (STICKER_REGISTRY_ADDRESS) {
          const [totalFinds, uniqueFinders] = await Promise.all([
            publicClient.readContract({
              address: STICKER_REGISTRY_ADDRESS,
              abi: STICKER_REGISTRY_ABI,
              functionName: 'totalFinds',
            }),
            publicClient.readContract({
              address: STICKER_REGISTRY_ADDRESS,
              abi: STICKER_REGISTRY_ABI,
              functionName: 'uniqueFinders',
            }),
          ])
          setOnChainStats({
            totalFinds: Number(totalFinds),
            uniqueFinders: Number(uniqueFinders),
          })
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-4 shadow-2xl text-center">
        <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  if (!stats) return null

  const statItems = [
    { label: 'Total Finds', value: stats.totalFinds, color: 'text-red-300' },
    { label: 'Sticker Hunters', value: stats.totalFinders, color: 'text-orange-300' },
    { label: 'Cities', value: stats.totalCities, color: 'text-yellow-300' },
    { label: 'Countries', value: stats.totalCountries, color: 'text-green-300' },
  ]

  return (
    <div className="space-y-4">
      {/* DB Stats */}
      <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-4 shadow-2xl">
        <h3 className="text-xl text-white mb-3 text-center" style={customFontStyle}>
          Global Stats
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="bg-black/30 rounded-xl border-2 border-red-600 p-3 text-center"
            >
              <p className={`text-2xl font-bold ${item.color}`} style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {item.value}
              </p>
              <p className="text-[10px] text-white/60 uppercase tracking-wider" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* On-Chain Stats */}
      {onChainStats && (
        <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-4 shadow-2xl">
          <h3 className="text-xl text-white mb-3 text-center" style={customFontStyle}>
            On-Chain (Base)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/30 rounded-xl border-2 border-blue-500 p-3 text-center">
              <p className="text-2xl font-bold text-blue-300" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {onChainStats.totalFinds}
              </p>
              <p className="text-[10px] text-white/60 uppercase tracking-wider" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                On-Chain Finds
              </p>
            </div>
            <div className="bg-black/30 rounded-xl border-2 border-blue-500 p-3 text-center">
              <p className="text-2xl font-bold text-blue-300" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                {onChainStats.uniqueFinders}
              </p>
              <p className="text-[10px] text-white/60 uppercase tracking-wider" style={{ fontFamily: 'var(--font-luckiest-guy)' }}>
                On-Chain Hunters
              </p>
            </div>
          </div>
          <div className="mt-3 text-center">
            <a
              href={`https://basescan.org/address/${STICKER_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-300 underline"
              style={{ fontFamily: 'var(--font-luckiest-guy)' }}
            >
              View Contract on Basescan
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
