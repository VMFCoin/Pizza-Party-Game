'use client';

import * as React from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card"; // Removed unused CardContent
import { ArrowLeft } from "lucide-react";
import GamePage from "./components/game";
import WeeklyJackpotPage from "./components/WeeklyJackpotPage";
import LeaderboardPage from "./components/LeaderboardPage";
import { sdk } from "@farcaster/miniapp-sdk";
import { useRouter, useSearchParams } from "next/navigation";

type ViewType = 'home' | 'game' | 'weekly' | 'leaderboard'

export default function HomePage() {
  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: "bold" as const,
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobile, setIsMobile] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('home');

  const updateViewParam = React.useCallback((view: ViewType) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (view === 'home') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const query = params.toString()
    const nextUrl = query ? `/?${query}` : '/'
    router.push(nextUrl, { scroll: true })
  }, [router, searchParams])

  const goToView = React.useCallback((view: ViewType) => {
    setCurrentView(view)
    updateViewParam(view)
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [updateViewParam])

  useEffect(() => {
    const viewParam = searchParams?.get('view') as 'home' | 'game' | 'weekly' | 'leaderboard' | null
    if (viewParam && viewParam !== currentView && ['home', 'game', 'weekly', 'leaderboard'].includes(viewParam)) {
      setCurrentView(viewParam)
    }
    if (!viewParam && currentView !== 'home') {
      setCurrentView('home')
    }
  }, [searchParams, currentView])

  // Device detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Farcaster SDK ready
  useEffect(() => {
    sdk.actions.ready();
  }, []);

  const handleStartPlaying = () => goToView('game')

  const handleBackToHome = () => goToView('home')

  const handleNavigateToWeekly = () => goToView('weekly')

  const handleNavigateToLeaderboard = () => goToView('leaderboard')

  // GAME VIEW
  if (currentView === 'game') {
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
            onClick={handleBackToHome}
            className="mb-4 !bg-red-700 hover:!bg-red-800 text-white font-bold py-2 px-4 rounded-xl border-2 border-red-900 shadow-lg flex items-center gap-2"
            style={customFontStyle}
          >
            <ArrowLeft size={20} />
            Back to Home
          </Button>

          <Card className="border-4 border-red-800 rounded-3xl shadow-2xl p-0 !px-0 !py-0 !bg-transparent">
            <GamePage onNavigateToWeekly={handleNavigateToWeekly} onNavigateToLeaderboard={handleNavigateToLeaderboard} />
          </Card>
        </div>
      </div>
    );
  }

  if (currentView === 'weekly') {
    return (
      <WeeklyJackpotPage
        onBack={() => goToView('game')}
        onNavigateToDaily={() => goToView('game')}
        onNavigateToHome={handleBackToHome}
        onNavigateToLeaderboard={handleNavigateToLeaderboard}
      />
    );
  }

  if (currentView === 'leaderboard') {
    return (
      <LeaderboardPage
        onBack={() => goToView('game')}
        onNavigateToDaily={() => goToView('game')}
        onNavigateToWeekly={handleNavigateToWeekly}
        onNavigateToHome={handleBackToHome}
      />
    );
  }

  // HOME VIEW
  return (
    <main>
      <header
        className="min-h-screen p-5 bg-cover"
        style={{ backgroundImage: "url('/images/rotated-90-pizza-wallpaper.png')" }}
      >
        <div className="max-w-md mx-auto">
          <Card
            className="border-4 border-red-800 rounded-3xl shadow-2xl p-6 text-center bg-white"
            style={{
              backgroundImage: "url('/images/Pepperoni game modal background.JPG')",
              backgroundSize: 'cover',
            }}
          >
            {/* Title */}
            <div className="mb-4 border-4 border-black rounded-2xl relative overflow-hidden" style={{ width: '100%' }}>
              <div className="relative w-full" style={{ paddingBottom: '35%', minHeight: '140px' }}>
                <Image
                  src="/images/PizzaPartyCard.png"
                  alt="PIZZA PARTY"
                  fill
                  className="object-cover"
                  priority
                  sizes="100vw"
                  style={{ objectPosition: 'center 42%' }}
                />
              </div>
            </div>

            {/* Pizza Image */}
            <div className="flex justify-center items-center mb-4">
              <div
                className="relative"
                style={{
                  width: isMobile ? 180 : 320,
                  height: isMobile ? 180 : 320,
                  transform: isMobile ? 'scale(1.25)' : 'scale(1.15)',
                  transformOrigin: 'center',
                }}
              >
                <Image
                  src={isMobile ? "/images/pizza-final.png" : "/images/pizza-transparent-mobile.png"}
                  alt="Pizza"
                  width={isMobile ? 180 : 320}
                  height={isMobile ? 180 : 320}
                  priority
                  className="drop-shadow-2xl"
                />
                <svg
                  viewBox={isMobile ? "0 0 180 180" : "0 0 320 320"}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                >
                  {[...Array(8)].map((_, i) => {
                    const angle = i * 45 - 90
                    const center = isMobile ? 90 : 160
                    const radius = isMobile ? 80 : 140
                    const endX = center + radius * Math.cos((angle * Math.PI) / 180)
                    const endY = center + radius * Math.sin((angle * Math.PI) / 180)
                    return (
                      <line
                        key={i}
                        x1={center}
                        y1={center}
                        x2={endX}
                        y2={endY}
                        stroke="#8B4513"
                        strokeWidth={3}
                        opacity={0.7}
                      />
                    )
                  })}
                </svg>
              </div>
            </div>

            {/* Call-to-Action */}
            <div className="mb-6 border-4 border-black rounded-2xl relative overflow-hidden" style={{ width: '100%' }}>
              <div className="relative w-full" style={{ paddingBottom: '25%', minHeight: '90px' }}>
                <Image
                  src="/images/PlayToWin.png"
                  alt="PLAY TO WIN A SLICE!"
                  fill
                  className="object-cover"
                  priority
                  sizes="100vw"
                  style={{ objectPosition: 'center 48%' }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col mt-[-12px]" style={{ gap: "12px" }}>
              <Button
                onClick={handleStartPlaying}
                className="w-full !bg-green-600 hover:!bg-green-700 text-white py-3 px-6 rounded-xl border-4 border-green-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20, fontWeight: '900' }}
              >
                🍕 START PLAYING 🍕
              </Button>

              <Button
                onClick={handleNavigateToWeekly}
                className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white py-3 px-6 rounded-xl border-4 border-yellow-800 shadow-lg transform hover:scale-105 transition-all touch-manipulation"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20, fontWeight: '900' }}
              >
                <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1" />
                WEEKLY JACKPOT
                <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1" />
              </Button>

              <Button
                onClick={handleNavigateToLeaderboard}
                className="w-full !bg-red-700 hover:!bg-red-800 text-white font-bold py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation uppercase"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20 }}
              >
                <Image
                  src="/images/mushroom-icon2.png"
                  alt="Mushroom"
                  width={20}
                  height={20}
                  className="inline mr-1"
                  style={{ backgroundColor: 'transparent', border: 'none' }}
                />
                LEADERBOARD
                <Image
                  src="/images/mushroom-icon2.png"
                  alt="Mushroom"
                  width={20}
                  height={20}
                  className="inline ml-1"
                  style={{ backgroundColor: 'transparent', border: 'none' }}
                />
              </Button>

            </div>

          </Card>
        </div>
      </header>
    </main>
  );
}
