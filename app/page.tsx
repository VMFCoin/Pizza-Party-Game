'use client';

import * as React from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card"; // Removed unused CardContent
import { ArrowLeft } from "lucide-react";
import GamePage from "./components/game";
import { sdk } from "@farcaster/miniapp-sdk";

export default function HomePage() {
  const customFontStyle = {
    fontFamily: '"Comic Sans MS", "Marker Felt", "Chalkduster", "Kalam", "Caveat"',
    fontWeight: "bold" as const,
  };

  const [isMobile, setIsMobile] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'game'>('home');

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

  const handleStartPlaying = () => {
    setCurrentView('game');
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const handleBackToHome = () => {
    setCurrentView('home');
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

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

          <Card className="border-4 border-red-800 rounded-3xl shadow-2xl p-8 bg-white">
            <GamePage />
          </Card>
        </div>
      </div>
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
            <div className="mb-4 bg-white border-4 border-black p-5 rounded-2xl">
              {['PIZZA', 'PARTY'].map((word, idx) => (
                <div
                  key={idx}
                  className="text-7xl sm:text-8xl md:text-8xl font-black transform -rotate-2 drop-shadow-lg"
                  style={{
                    ...customFontStyle,
                    color: "#DC2626",
                    textShadow:
                      "2px 2px 0px #991B1B, 4px 4px 0px #7F1D1D, 6px 6px 10px rgba(0,0,0,0.3)",
                    letterSpacing: "2px",
                    fontWeight: "900",
                    WebkitTextStroke: "1px #450A0A",
                    background: "linear-gradient(45deg, #DC2626, #EF4444, #F87171)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 3px #DC2626)",
                  }}
                >
                  {word}
                </div>
              ))}
            </div>

            {/* Pizza Image with slice overlay */}
            <div className="flex justify-center items-center mb-4 relative">
              <Image
                src={isMobile ? "/images/pizza-transparent-mobile.png" : "/images/pizza-final.png"}
                alt="Pizza"
                width={isMobile ? 144 : 240}
                height={isMobile ? 144 : 240}
                priority
                className="drop-shadow-2xl"
              />

              <svg
                viewBox={isMobile ? "0 0 144 144" : "0 0 240 240"}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              >
                {[...Array(8)].map((_, i) => {
                  const angle = i * 45 - 90;
                  const centerX = isMobile ? 72 : 120;
                  const centerY = isMobile ? 72 : 120;
                  const radius = isMobile ? 64 : 105;
                  const endX = centerX + radius * Math.cos((angle * Math.PI) / 180);
                  const endY = centerY + radius * Math.sin((angle * Math.PI) / 180);
                  return (
                    <line
                      key={i}
                      x1={centerX}
                      y1={centerY}
                      x2={endX}
                      y2={endY}
                      stroke="#8B4513"
                      strokeWidth={isMobile ? 2 : 3}
                      opacity={0.7}
                    />
                  );
                })}
              </svg>
            </div>

            {/* Call-to-Action */}
            <div className="bg-white border-4 border-black p-4 mb-6 transform rotate-1 rounded-2xl">
              <div
                className="text-4xl sm:text-5xl lg:text-5xl font-black transform -rotate-2 drop-shadow-lg leading-tight"
                style={{
                  ...customFontStyle,
                  color: "#DC2626",
                  textShadow: "2px 2px 0px #991B1B, 4px 4px 0px #7F1D1D, 6px 6px 10px rgba(0,0,0,0.3)",
                  letterSpacing: "2px",
                  fontWeight: "900",
                  WebkitTextStroke: "1px #450A0A",
                  background: "linear-gradient(45deg, #DC2626, #EF4444, #F87171)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 3px #DC2626)",
                  whiteSpace: "pre-line",
                  fontSize: isMobile ? undefined : "42px",
                }}
              >
                <div className="block sm:hidden md:hidden lg:block xl:block">
                  <div style={{ whiteSpace: "nowrap" }}>PLAY TO WIN</div>
                  <div style={{ whiteSpace: "nowrap" }}>A SLICE!</div>
                </div>
                <span className="hidden sm:block md:block lg:hidden xl:hidden">PLAY TO WIN A SLICE!</span>
              </div>
            </div>

            {/* Start Playing Button */}
            <Button
              onClick={handleStartPlaying}
              className="w-full !bg-red-700 hover:!bg-red-800 text-white text-lg font-bold py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg transform hover:scale-105 transition-all touch-manipulation mb-4"
              style={{ ...customFontStyle, letterSpacing: "1px", fontSize: isMobile ? 18 : 20 }}
            >
              🍕 START PLAYING 🍕
            </Button>

            {/* Disabled Buttons */}
            <div className="flex flex-col" style={{ gap: "15px" }}>
              <Button
                className="w-full !bg-red-700 text-white text-lg font-bold py-3 px-6 rounded-xl border-4 border-red-900 shadow-lg opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
                disabled
              >
                <Image src="/images/star-favicon.png" alt="Star" width={24} height={24} className="rounded-full mx-1" />
                Weekly Jackpot
                <Image src="/images/star-favicon.png" alt="Star" width={24} height={24} className="rounded-full mx-1" />
              </Button>

              <Button
                className="w-full !bg-green-600 text-white text-lg font-bold py-3 px-6 rounded-xl border-4 border-green-800 shadow-lg opacity-50 cursor-not-allowed"
                style={{ ...customFontStyle, fontSize: isMobile ? 18 : 20 }}
                disabled
              >
                🏆 LEADERBOARD 🏆
              </Button>
            </div>

          </Card>
        </div>
      </header>
    </main>
  );
}
