import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from 'next/headers';
import ContextProvider from './context';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Pizza Party',
    description: '8 Slices, 8 Winners! Play to win VMF tokens every 24 hours',
    icons: {
      icon: [{ url: "/favicon.ico" }],
      shortcut: [{ url: "/images/star-favicon.png" }],
      apple: [{ url: "/images/pizza-final.png" }],
    },
    openGraph: {
      title: "Pizza Party",
      description: "8 Slices, 8 Winners! Play daily to win VMF tokens 🍕",
      url: "https://pizza-party.vmfcoin.com",
      siteName: "Pizza Party",
      images: [
        {
          url: "/images/pizza-final.png",
          width: 1200,
          height: 627,
          alt: "Pizza Party",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Pizza Party",
      description: "8 Slices, 8 Winners! Play daily to win VMF tokens 🍕",
      images: ["/images/pizza-final.png"],
    },
    other: {
      'fc:miniapp': JSON.stringify({
        version: 'next',
        imageUrl: 'https://pizza-party.vmfcoin.com/images/pizza-final.png',
        button: {
          title: `Launch Pizza Party`,
          action: {
            type: 'launch_miniapp',
            name: 'Pizza Party',
            url: 'https://pizza-party.vmfcoin.com',
            splashImageUrl: "https://pizza-party.vmfcoin.com/images/pizza-final.png",
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