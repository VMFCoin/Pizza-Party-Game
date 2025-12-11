import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from 'next/headers';
import ContextProvider from './context';
import './globals.css';
import AutoEnableNotifications from './components/AutoEnableNotifications';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  // Serve OG imagery from our own host to avoid third-party outages.
  const siteBaseUrl = "https://pizza-party-game.vmfcoin.com"
  const fallbackOgImage = `${siteBaseUrl}/images/OGimage.png`
  const remoteOgImage = "https://i.postimg.cc/DyrDyj4j/OGimage.png"

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
      url: siteBaseUrl,
      siteName: "Pizza Party",
      images: [
        {
          url: remoteOgImage,
          width: 1200,
          height: 630,
          alt: "Pizza Party - Win Daily Jackpots",
        },
        {
          url: fallbackOgImage,
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
      images: [remoteOgImage, fallbackOgImage],
    },
    other: {
      // Farcaster manifest
      'fc:miniapp': JSON.stringify({
        version: 'next',
        imageUrl: remoteOgImage,
        button: {
          title: `Play Pizza Party`,
          action: {
            type: 'launch_miniapp',
            name: 'Pizza Party',
            url: siteBaseUrl,
            splashImageUrl: remoteOgImage,
            splashBackgroundColor: "#DC2626",
          },
        },
      }),
      // Base app ID for Mini App discovery
      'base:app_id': '69254ad0547fca5d081313c0',
      // Base manifest
      'miniapp:manifest': JSON.stringify({
        name: 'Pizza Party',
        iconUrl: remoteOgImage,
        splashImageUrl: remoteOgImage,
        splashBackgroundColor: '#DC2626',
        homeUrl: siteBaseUrl,
        baseBuilder: {
          ownerAddress: '0x12e31f706010AE0996A2D8247c432d9102e3c871',
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
        <head>
          <meta name="base:app_id" content="69254ad0547fca5d081313c0" />
        </head>
        <body className={inter.className}>
          <AutoEnableNotifications />
          {children}
        </body>
      </html>
    </ContextProvider>
  );
}
