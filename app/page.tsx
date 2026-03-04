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
import { useAccount } from 'wagmi';
import { isUserBanned } from './lib/constants/banList';

import { PizzaPartyResultPopup } from "./components/PizzaPartyResultPopup";


type ViewType = 'home' | 'game' | 'weekly' | 'leaderboard' | 'parlor' | 'staking'

export default function HomePage() {
  const customFontStyle = {
    fontFamily: 'var(--font-luckiest-guy)',
    fontWeight: "bold" as const,
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobile, setIsMobile] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [userFid, setUserFid] = useState<number | null>(null);
  const { address: walletAddress } = useAccount();
  const isBanned = isUserBanned(userFid, walletAddress);

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
              <GamePage onNavigateToWeekly={handleNavigateToWeekly} onNavigateToLeaderboard={handleNavigateToLeaderboard} onNavigateToParlor={handleNavigateToParlor} onNavigateToStaking={handleNavigateToStaking} isBanned={isBanned} />
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
          isBanned={isBanned}
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
          isBanned={isBanned}
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
          isBanned={isBanned}
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
          isBanned={isBanned}
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

            {/* Early Boost Starburst Badge */}
            <div className="relative">
              <div
                className="absolute z-10"
                style={{
                  right: isMobile ? '-15px' : '-25px',
                  top: isMobile ? '-20px' : '-25px',
                  width: isMobile ? '150px' : '190px',
                  height: isMobile ? '150px' : '190px',
                }}
              >
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))' }}>
                  <defs>
                    <filter id="whiteShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="1" dy="1" stdDeviation="0.5" floodColor="#FAF9F7" floodOpacity="0.8" />
                    </filter>
                  </defs>
                  <polygon
                    points="100,5 117,40 155,15 142,55 185,50 158,80 195,100 158,120 185,150 142,145 155,185 117,160 100,195 83,160 45,185 58,145 15,150 42,120 5,100 42,80 15,50 58,55 45,15 83,40"
                    fill="#27D431"
                    stroke="#1a8f22"
                    strokeWidth="3"
                  />
                  <g transform="rotate(12, 100, 100)">
                    <text
                      x="100"
                      y="68"
                      textAnchor="middle"
                      fill="#D43127"
                      style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '28px', fontWeight: 'bold' }}
                      filter="url(#whiteShadow)"
                    >
                      30%
                    </text>
                    <text
                      x="100"
                      y="90"
                      textAnchor="middle"
                      fill="#D43127"
                      style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '16px', fontWeight: 'bold' }}
                      filter="url(#whiteShadow)"
                    >
                      Limited Time
                    </text>
                    <text
                      x="100"
                      y="115"
                      textAnchor="middle"
                      fill="#D43127"
                      style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '20px', fontWeight: 'bold' }}
                      filter="url(#whiteShadow)"
                    >
                      Extra Spin
                    </text>
                    <text
                      x="100"
                      y="138"
                      textAnchor="middle"
                      fill="#D43127"
                      style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '20px', fontWeight: 'bold' }}
                      filter="url(#whiteShadow)"
                    >
                      Rewards
                    </text>
                  </g>
                </svg>
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

            {/* Banned User Banner */}
            {isBanned && (
              <div className="bg-red-100 border-2 border-red-400 rounded-xl p-3 mb-2 text-center">
                <p className="text-red-700 font-bold" style={customFontStyle}>Account Restricted</p>
                <p className="text-red-600 text-sm">Your account has been restricted due to policy violations.</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col mt-[-12px]" style={{ gap: "12px" }}>
              {/* Call-to-Action */}
              <div className="w-full rounded-2xl relative" style={{ marginTop: '8px', marginBottom: '8px' }}>
                {/* Crusties Mini App Link */}
                <button
                  onClick={async () => {
                    try {
                      await sdk.actions.openMiniApp({
                        url: 'https://farcaster.xyz/miniapps/b8-LN08vo1G6/crusties',
                      });
                    } catch (error) {
                      console.error('Failed to open Crusties Mini App:', error);
                    }
                  }}
                  style={{ position: 'absolute', top: '-70px', left: '-8px', zIndex: 50, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <img src="/images/app-logo.png" alt="Crusties" style={{ height: '75px', width: '75px', display: 'block', borderRadius: '50%', objectFit: 'cover' }} />
                </button>
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
              {/* GRAB A SLICE */}
              <Button
                onClick={handleStartPlaying}
                disabled={isBanned}
                className="w-full !bg-red-600 hover:!bg-red-700 text-white py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20, fontWeight: '900' }}
              >
                🍕 GRAB A SLICE 🍕
              </Button>

              {/* CLAIM TOPPINGS (Weekly Jackpot) */}
              <Button
                onClick={handleNavigateToWeekly}
                disabled={isBanned}
                className="w-full !bg-orange-500 hover:!bg-orange-600 text-white py-3 px-6 rounded-xl border-4 border-orange-700 shadow-lg transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20, fontWeight: '900' }}
              >
                <span className="flex items-center justify-center w-full gap-2">
                  <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
                  <span className="text-center">CLAIM TOPPINGS</span>
                  <Image src="/images/pepperoni-art.png" alt="Pepperoni" width={20} height={20} className="inline" />
                </span>
              </Button>

              {/* LEADERBOARD */}
              <Button
                onClick={handleNavigateToLeaderboard}
                disabled={isBanned}
                className="w-full !bg-yellow-500 hover:!bg-yellow-600 text-white font-bold py-3 px-6 rounded-xl border-4 border-yellow-700 shadow-lg transform hover:scale-105 transition-all touch-manipulation uppercase disabled:opacity-50 disabled:pointer-events-none"
                style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20 }}
              >
                <span className="flex items-center justify-center w-full gap-2">
                  <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
                  <span className="text-center">LEADERBOARD</span>
                  <Image src="/images/mushroom-icon2.png" alt="Mushroom" width={20} height={20} className="inline" style={{ backgroundColor: 'transparent', border: 'none' }} />
                </span>
              </Button>

              {/* OWN A PARLOR */}
              <Button
                onClick={handleNavigateToParlor}
                disabled={isBanned}
                className="w-full !bg-amber-600 hover:!bg-amber-700 text-white font-bold py-3 px-6 rounded-xl border-4 border-amber-800 shadow-lg uppercase transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                style={{
                  ...customFontStyle,
                  letterSpacing: "1px",
                  fontSize: isMobile ? 18 : 20
                }}
              >
                🍍 OWN A PARLOR 🍍
              </Button>

              {/* Spin & Stake */}
              <Button
                onClick={handleNavigateToStaking}
                disabled={isBanned}
                className="w-full !bg-green-600 hover:!bg-green-700 text-white font-bold py-3 px-6 rounded-xl border-4 border-green-900 shadow-lg uppercase transform hover:scale-105 transition-all touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                style={{
                  ...customFontStyle,
                  letterSpacing: "1px",
                  fontSize: isMobile ? 18 : 20
                }}
              >
                <span className="flex items-center justify-center w-full gap-2">
                  <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
                  <span className="text-center">Spin & Stake</span>
                  <img src="/images/pizza_wheel.png" alt="" className="inline-block" style={{ height: '1em', width: '1em' }} />
                </span>
              </Button>

            </div>

          </Card>

          {/* PLAY ON Section */}
          <div className="flex items-center justify-center gap-3 mt-1 mb-0 py-0">
            <span style={{ fontFamily: 'var(--font-luckiest-guy)', fontSize: '28px', color: 'white', textShadow: '2px 2px 0px #000', lineHeight: '1' }}>
              PLAY ON:
            </span>
            <a href="https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party" target="_blank" rel="noopener noreferrer">
              <img src="/images/Farcaster_logo.png" alt="Farcaster" width={32} height={32} style={{ maxWidth: '32px', maxHeight: '32px', borderRadius: '6px', display: 'block' }} />
            </a>
            <a href="https://base.app/app/pizza-party-game.vmfcoin.com" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '12px' }}>
              <img src="/images/Base_logo.png" alt="Base" width={32} height={32} style={{ maxWidth: '32px', maxHeight: '32px', borderRadius: '6px', display: 'block' }} />
            </a>
            <a href="https://pizza-party-game.vmfcoin.com" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '12px' }}>
              <img src="/images/web-icon.png" alt="Website" width={32} height={32} style={{ maxWidth: '32px', maxHeight: '32px', borderRadius: '6px', display: 'block' }} />
            </a>
          </div>

          <div className="flex items-center justify-center gap-2 mt-2" style={{ fontSize: '12px', color: '#000', fontFamily: 'inherit' }}>
            <a href="https://pizza-party-game.vmfcoin.com/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">Terms of Service</a>
            <span>·</span>
            <a href="https://pizza-party-game.vmfcoin.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline">Privacy Policy</a>
          </div>

        </div>
      </header>
    </main>
  );
}
