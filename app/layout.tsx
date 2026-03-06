import type { Metadata } from "next";
import { Inter, Luckiest_Guy } from "next/font/google";
import { headers } from 'next/headers';
import ContextProvider from './context';
import './globals.css';
import AutoEnableNotifications from './components/AutoEnableNotifications';

const inter = Inter({ subsets: ['latin'] });
const luckiestGuy = Luckiest_Guy({ weight: '400', subsets: ['latin'], variable: '--font-luckiest-guy' });

export async function generateMetadata(): Promise<Metadata> {
  const siteBaseUrl = "https://pizza-party-game.vmfcoin.com"
  const ogImage = `${siteBaseUrl}/images/New_PizzaParty_ShareImage.png`
  const remoteOgImage = "https://i.postimg.cc/nrktq50x/New_Pizza_Party_Share_Image.png"

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
          url: ogImage,
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
      images: [ogImage],
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
            splashImageUrl: "https://i.postimg.cc/Y2bLKkdC/E49A4767_F207_4D3C_9CE7_226129385659.png",
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
        splashImageUrl: "https://i.postimg.cc/Y2bLKkdC/E49A4767_F207_4D3C_9CE7_226129385659.png",
        splashBackgroundColor: '#DC2626',
        homeUrl: siteBaseUrl,
        noindex: false,
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
        <body className={`${inter.className} ${luckiestGuy.variable}`}>
          <AutoEnableNotifications />
          {children}
        </body>
      </html>
    </ContextProvider>
  );
}
