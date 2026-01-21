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
import PizzaParlorPage from "./components/PizzaParlorPage";
import StakingPage from "./components/StakingPage";
import { sdk } from "@farcaster/miniapp-sdk";
import { useRouter, useSearchParams } from "next/navigation";

import { PizzaPartyResultPopup } from "./components/PizzaPartyResultPopup";


type ViewType = 'home' | 'game' | 'weekly' | 'leaderboard' | 'parlor' | 'staking'

export default function HomePage() {
  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: "bold" as const,
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobile, setIsMobile] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [userFid, setUserFid] = useState<number | null>(null);

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
    const viewParam = searchParams?.get('view') as ViewType | null

    if (viewParam && ['home', 'game', 'weekly', 'leaderboard', 'parlor', 'staking'].includes(viewParam)) {
      setCurrentView(viewParam)
    } else if (!viewParam) {
      setCurrentView('home')
    }
  }, [searchParams])

  // Device detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 960);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Farcaster SDK ready and get user FID
  useEffect(() => {
    sdk.actions.ready();

    // Get user's FID from SDK context
    const getUserFid = async () => {
      try {
        const context = await sdk.context;
        if (context?.user?.fid) {
          setUserFid(context.user.fid);
        }
      } catch (error) {
        console.error('Error getting user FID:', error);
      }
    };
    getUserFid();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleStartPlaying = () => goToView('game')

  const handleBackToHome = () => goToView('home')

  const handleNavigateToWeekly = () => goToView('weekly')

  const handleNavigateToLeaderboard = () => goToView('leaderboard')

  const handleNavigateToParlor = () => goToView('parlor')

  const handleNavigateToStaking = () => goToView('staking')

  // GAME VIEW
  if (currentView === 'game') {
    return (
      <>
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
              style={{ ...customFontStyle, fontFamily: 'var(--font-luckiest-guy)' }}
            >
              <ArrowLeft size={20} />
              Back to Home
            </Button>

            <Card className="border-4 border-red-800 rounded-3xl shadow-2xl p-0 !px-0 !py-0 !bg-transparent">
              <GamePage onNavigateToWeekly={handleNavigateToWeekly} onNavigateToLeaderboard={handleNavigateToLeaderboard} onNavigateToParlor={handleNavigateToParlor} onNavigateToStaking={handleNavigateToStaking} userFid={userFid} />
            </Card>
          </div>
        </div>
      </>
    );
  }

  if (currentView === 'weekly') {
    return (
      <>
        <WeeklyJackpotPage
          onBack={() => goToView('game')}
          onNavigateToDaily={() => goToView('game')}
          onNavigateToHome={handleBackToHome}
          onNavigateToLeaderboard={handleNavigateToLeaderboard}
          onNavigateToParlor={handleNavigateToParlor}
          onNavigateToStaking={handleNavigateToStaking}
          userFid={userFid}
        />
      </>
    );
  }

  if (currentView === 'leaderboard') {
    return (
      <>
        <LeaderboardPage
          onBack={() => goToView('game')}
          onNavigateToDaily={() => goToView('game')}
          onNavigateToWeekly={handleNavigateToWeekly}
          onNavigateToHome={handleBackToHome}
          onNavigateToParlor={handleNavigateToParlor}
          onNavigateToStaking={handleNavigateToStaking}
          userFid={userFid}
        />
      </>
    );
  }

  if (currentView === 'parlor') {
    return (
      <>
        <PizzaParlorPage
          onBack={handleBackToHome}
          onNavigateToDaily={() => goToView('game')}
          onNavigateToWeekly={handleNavigateToWeekly}
          onNavigateToLeaderboard={handleNavigateToLeaderboard}
          onNavigateToHome={handleBackToHome}
          onNavigateToStaking={handleNavigateToStaking}
          userFid={userFid}
        />
      </>
    );
  }

  if (currentView === 'staking') {
    return (
      <>
        <StakingPage
          onBack={handleBackToHome}
          onNavigateToDaily={() => goToView('game')}
          onNavigateToWeekly={handleNavigateToWeekly}
          onNavigateToLeaderboard={handleNavigateToLeaderboard}
          onNavigateToParlor={handleNavigateToParlor}
          onNavigateToHome={handleBackToHome}
          userFid={userFid}
        />
      </>
    );
  }

  // HOME VIEW
  return (
    <main>
      <PizzaPartyResultPopup />
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
              <div className="relative w-full" style={{ paddingBottom: isMobile ? '29.75%' : '35%', minHeight: isMobile ? '109px' : '140px' }}>
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

            {/* Action Buttons */}
            <div className="flex flex-col mt-[-12px]" style={{ gap: "12px" }}>
              {/* Call-to-Action */}
              <div className="w-full rounded-2xl relative overflow-hidden" style={{ marginTop: '8px', marginBottom: '8px' }}>
                {/* Play_to_Win.png is 919×284 (~3.24:1). Use matching aspect ratio so it can be full-width without cropping. */}
                <div
                  className="relative w-full"
                  style={{
                    paddingBottom: '30.9%',
                    minHeight: isMobile ? '110px' : '130px',
                  }}
                >
                  <Image
                    src="/images/Play_to_Win.png"
                    alt="PLAY TO WIN A SLICE!"
                    fill
                    className="object-contain"
                    priority
                    sizes="100vw"
                    style={{ objectPosition: 'center center' }}
                  />
                </div>
              </div>
              {/* MIGRATION MODE: All buttons disabled except ??? for whitelisted FIDs */}
              {(() => {
                const STAKING_WHITELIST_FIDS = [1013491, 1060809, 963422, 392134, 200506]
                const canAccessStaking = userFid && STAKING_WHITELIST_FIDS.includes(userFid)

                return (
                  <>
                    {/* GRAB A SLICE - Disabled during migration */}
                    <Button
                      disabled
                      className="w-full !bg-gray-500 text-gray-300 py-3 px-6 rounded-xl border-4 border-gray-700 shadow-lg cursor-not-allowed opacity-60"
                      style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20, fontWeight: '900' }}
                    >
                      🍕 GRAB A SLICE 🍕
                    </Button>

                    {/* WEEKLY JACKPOT - Disabled during migration */}
                    <Button
                      disabled
                      className="w-full !bg-gray-500 text-gray-300 py-3 px-6 rounded-xl border-4 border-gray-700 shadow-lg cursor-not-allowed opacity-60"
                      style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20, fontWeight: '900' }}
                    >
                      <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline mr-1 opacity-50" />
                      CLAIM TOPPINGS
                      <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline ml-1 opacity-50" />
                    </Button>

                    {/* LEADERBOARD - Disabled during migration */}
                    <Button
                      disabled
                      className="w-full !bg-gray-500 text-gray-300 font-bold py-3 px-6 rounded-xl border-4 border-gray-700 shadow-lg cursor-not-allowed opacity-60 uppercase"
                      style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20 }}
                    >
                      <Image
                        src="/images/mushroom-icon2.png"
                        alt="Mushroom"
                        width={20}
                        height={20}
                        className="inline mr-1 opacity-50"
                        style={{ backgroundColor: 'transparent', border: 'none' }}
                      />
                      LEADERBOARD
                      <Image
                        src="/images/mushroom-icon2.png"
                        alt="Mushroom"
                        width={20}
                        height={20}
                        className="inline ml-1 opacity-50"
                        style={{ backgroundColor: 'transparent', border: 'none' }}
                      />
                    </Button>

                    {/* OWN A PARLOR - Disabled during migration */}
                    <Button
                      disabled
                      className="w-full !bg-gray-500 text-gray-300 font-bold py-3 px-6 rounded-xl border-4 border-gray-700 shadow-lg uppercase cursor-not-allowed opacity-60"
                      style={{
                        ...customFontStyle,
                        letterSpacing: "1px",
                        fontSize: isMobile ? 18 : 20
                      }}
                    >
                      🍍 OWN A PARLOR 🍍
                    </Button>

                    {/* ??? Button - Only active for whitelisted FIDs */}
                    <Button
                      onClick={canAccessStaking ? handleNavigateToStaking : undefined}
                      className={`w-full text-white font-bold py-3 px-6 rounded-xl border-4 shadow-lg uppercase transform transition-all touch-manipulation ${
                        canAccessStaking
                          ? '!bg-green-600 hover:!bg-green-700 hover:scale-105 cursor-pointer border-green-900'
                          : '!bg-gray-500 text-gray-300 border-gray-700 cursor-not-allowed opacity-60'
                      }`}
                      style={{
                        ...customFontStyle,
                        letterSpacing: "1px",
                        fontSize: isMobile ? 18 : 20
                      }}
                      disabled={!canAccessStaking}
                    >
                      🍕 Spin & Stake 🍕
                    </Button>
                  </>
                )
              })()}

            </div>

          </Card>
        </div>
      </header>
    </main>
  );
}
