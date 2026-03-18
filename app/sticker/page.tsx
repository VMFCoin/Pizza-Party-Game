'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useAccount } from 'wagmi'
import { sdk } from '@farcaster/miniapp-sdk'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { StickerFindData, StickerMapHandle } from './components/StickerMap'
import StickerScanner from './components/StickerScanner'
import StickerGallery from './components/StickerGallery'
import StickerLeaderboard from './components/StickerLeaderboard'
import StickerStats from './components/StickerStats'
import StickerSearch from './components/StickerSearch'

// React Leaflet must be loaded client-side only (requires window/DOM)
const StickerMap = dynamic(() => import('./components/StickerMap'), { ssr: false })

const customFontStyle = {
  fontFamily: 'var(--font-luckiest-guy)',
  fontWeight: 'bold' as const,
  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
}

type Tab = 'map' | 'scan' | 'search' | 'leaderboard' | 'stats'

export default function StickerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('scan')
  const [finds, setFinds] = useState<StickerFindData[]>([])
  const [searchResults, setSearchResults] = useState<StickerFindData[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedFindId, setSelectedFindId] = useState<string | null>(null)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [userFid, setUserFid] = useState<number | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const { address: walletAddress } = useAccount()
  const mapRef = useRef<StickerMapHandle>(null)

  // Fetch all sticker finds
  const fetchFinds = useCallback(async () => {
    try {
      const res = await fetch('/api/sticker/finds')
      const data = await res.json()
      if (data.success) {
        setFinds(data.finds)
      }
    } catch (err) {
      console.error('Failed to fetch sticker finds:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFinds()
  }, [fetchFinds])

  // Get Farcaster user context
  useEffect(() => {
    const getUser = async () => {
      try {
        const context = await sdk.context
        if (context?.user?.fid) {
          setUserFid(context.user.fid)
          setUserName(context.user.displayName || context.user.username || null)
        }
      } catch {
        // Not in Farcaster context, that's fine (anonymous)
      }
    }
    getUser()
  }, [])

  // Handle gallery/search item click — fly to location on map
  const handleSelectFind = useCallback((find: StickerFindData) => {
    setSelectedFindId(find.id)
    setFlyTarget({ lat: find.latitude, lng: find.longitude })
    setActiveTab('map')
  }, [])

  // Handle search
  const handleSearch = useCallback(async (query: string) => {
    if (!query) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/sticker/finds?search=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.success) {
        setSearchResults(data.finds)
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Handle scan complete — refresh finds and go to map
  const handleScanComplete = useCallback(() => {
    fetchFinds()
    setActiveTab('map')
  }, [fetchFinds])

  const tabs: { key: Tab; label: string }[] = useMemo(() => [
    { key: 'scan', label: 'Scan' },
    { key: 'map', label: 'Map' },
    { key: 'search', label: 'Search' },
    { key: 'leaderboard', label: 'Board' },
    { key: 'stats', label: 'Stats' },
  ], [])

  return (
    <main>
      {/* Outer: Pizza wallpaper background */}
      <div
        className="min-h-screen p-5 bg-cover"
        style={{ backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')" }}
      >
        <div className="max-w-md mx-auto">
          {/* Back to Home */}
          <Button
            onClick={() => window.location.href = '/'}
            className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
            style={{ fontFamily: 'var(--font-luckiest-guy)' }}
          >
            <ArrowLeft size={20} />
            Back to Home
          </Button>

          {/* Main pepperoni card — same as home page */}
          <Card
            className="border-4 border-red-800 rounded-3xl shadow-2xl p-6 text-center bg-white"
            style={{
              backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
              backgroundSize: 'cover',
            }}
          >
            <div className="flex flex-col" style={{ gap: '8px' }}>
            {/* Title Card */}
            <div className="rounded-2xl relative overflow-hidden" style={{ width: '100%' }}>
              <div className="relative w-full" style={{ paddingBottom: '26.5%', minHeight: '80px' }}>
                <Image
                  src="/images/pizza_stickers.png"
                  alt="Pizza Stickers - Find Pizza stickers around the world!"
                  fill
                  className="object-contain"
                  priority
                  sizes="100vw"
                />
              </div>
            </div>

            {/* Rewards Banner */}
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl border-4 border-yellow-600 p-3 shadow-lg text-center">
              <p
                className="text-white text-lg"
                style={{ ...customFontStyle, textShadow: '2px 2px 0px rgba(0,0,0,0.3)' }}
              >
                Pizza Rewards Added Soon!
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-white/80 backdrop-blur-md rounded-xl border-2 border-black p-1 shadow-lg">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs transition-all ${
                    activeTab === tab.key
                      ? '!bg-red-600 text-white shadow-md border-2 border-red-900'
                      : 'text-red-700 hover:bg-red-100 border-2 border-transparent'
                  }`}
                  style={{ fontFamily: 'var(--font-luckiest-guy)', fontWeight: '900', letterSpacing: '0.5px' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Map Tab - Always render map, show/hide for tab persistence */}
            <div className={activeTab === 'map' ? '' : 'hidden'}>
              {loading ? (
                <div className="bg-red-800/80 backdrop-blur-md rounded-2xl border-4 border-black p-8 text-center">
                  <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-white" style={customFontStyle}>Loading world map...</p>
                </div>
              ) : (
                <>
                  <StickerMap
                    ref={mapRef}
                    finds={finds}
                    flyTarget={flyTarget}
                  />
                  <div style={{ marginTop: '8px' }}>
                    <StickerGallery
                      finds={finds}
                      onSelectFind={handleSelectFind}
                      selectedId={selectedFindId}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Scan Tab */}
            {activeTab === 'scan' && (
              <StickerScanner
                onComplete={handleScanComplete}
                walletAddress={walletAddress}
                userFid={userFid}
                userName={userName}
              />
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <StickerSearch
                onSearch={handleSearch}
                onSelectFind={handleSelectFind}
                searchResults={searchResults}
                isSearching={isSearching}
              />
            )}

            {/* Leaderboard Tab */}
            {activeTab === 'leaderboard' && (
              <StickerLeaderboard />
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <StickerStats />
            )}

            {/* Navigation Buttons — same as home page */}
            <div className="flex flex-col" style={{ gap: '8px' }}>
              <Button
                onClick={() => window.location.href = '/?view=game'}
                className="w-full !bg-red-600 hover:!bg-red-700 text-white py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px', fontWeight: '900' }}
              >
                🍕 GRAB A SLICE 🍕
              </Button>

              <Button
                onClick={() => window.location.href = '/?view=weekly'}
                className="w-full !bg-orange-500 hover:!bg-orange-600 text-white py-3 px-6 rounded-xl border-4 border-orange-700 shadow-lg transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px', fontWeight: '900' }}
              >
                <span className="flex items-center justify-center w-full gap-2">
                  <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
                  <span className="text-center">CLAIM TOPPINGS</span>
                  <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
                </span>
              </Button>

              <Button
                onClick={() => window.location.href = '/?view=leaderboard'}
                className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-3 px-6 rounded-xl border-4 border-yellow-700 shadow-lg transform hover:scale-105 transition-all touch-manipulation uppercase"
                style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px' }}
              >
                <span className="flex items-center justify-center w-full gap-2">
                  <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
                  <span className="text-center">LEADERBOARD</span>
                  <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
                </span>
              </Button>

              <Button
                onClick={() => window.location.href = '/?view=parlor'}
                className="w-full !bg-amber-600 hover:!bg-amber-700 text-white font-bold py-3 px-6 rounded-xl border-4 border-amber-800 shadow-lg uppercase transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px' }}
              >
                🍍 OWN A PARLOR 🍍
              </Button>

              <Button
                onClick={() => window.location.href = '/?view=staking'}
                className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-3 px-6 rounded-xl border-4 border-green-900 shadow-lg uppercase transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px' }}
              >
                <span className="flex items-center justify-center w-full gap-2">
                  <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
                  <span className="text-center">Spin & Stake</span>
                  <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
                </span>
              </Button>

              <Button
                onClick={() => {}}
                className="w-full !bg-red-600 hover:!bg-red-700 text-white py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: '1px', fontSize: '18px', fontWeight: '900' }}
              >
                🍕 PIZZA CHAT 🍕
              </Button>
            </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}
