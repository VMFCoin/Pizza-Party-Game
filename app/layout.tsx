import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from 'next/headers';
import ContextProvider from './context';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  // Use the same image that Farcaster uses for consistency across all platforms
  const ogAbsolutePath = "https://u.cubeupload.com/vmfcoin/142097AF71F541259315.png"

  return {
    title: 'Pizza Party',
    description: 'Win daily jackpots with Pizza Party! 🍕',
    icons: {
      icon: [{ url: "/favicon.ico" }],
      shortcut: [{ url: "/images/star-favicon.png" }],
      apple: [{ url: "/images/pizza-final.png" }],
    },
    openGraph: {
      title: "Pizza Party",
      description: "Win daily jackpots with Pizza Party! 🍕",
      url: "https://pizza-party-game.vmfcoin.com",
      siteName: "Pizza Party",
      images: [
        {
          url: ogAbsolutePath,
          width: 1200,
          height: 630,
          alt: "Pizza Party - Win Daily Jackpots",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Pizza Party",
      description: "Win daily jackpots with Pizza Party! 🍕",
      images: [ogAbsolutePath],
    },
    other: {
      'fc:miniapp': JSON.stringify({
        version: 'next',
        imageUrl: ogAbsolutePath,
        button: {
          title: `Play Pizza Party`,
          action: {
            type: 'launch_miniapp',
            name: 'Pizza Party',
            url: 'https://pizza-party-game.vmfcoin.com',
            splashImageUrl: ogAbsolutePath,
            splashBackgroundColor: "#DC2626",
          },
        },
      }),
    },
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get('cookie');

  return (
    <ContextProvider cookies={cookies}>
      <html lang="en">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ContextProvider>
  );
}
