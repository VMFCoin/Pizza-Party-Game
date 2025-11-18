import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{
    code: string
  }>
}

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_BASE_URL || 'https://pizza-party-game.vmfcoin.com'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const baseUrl = getBaseUrl()
  const frameImage = `${baseUrl}/images/frame-preview.png`

  return {
    title: `Join Pizza Party with code ${code}`,
    description: '🍕 Join Pizza Party to win a slice of VMF!',
    openGraph: {
      title: `Join Pizza Party with code ${code}`,
      description: '🍕 Join Pizza Party to win a slice of VMF!',
      images: [frameImage],
      url: `${baseUrl}/ref/${code}`,
    },
    other: {
      'fc:frame': 'vNext',
      'fc:frame:image': frameImage,
      'fc:frame:image:aspect_ratio': '1.91:1',
      'fc:frame:button:1': '🍕 Join Pizza Party',
      'fc:frame:button:1:action': 'link',
      'fc:frame:button:1:target': `${baseUrl}?ref=${code}`,
      'fc:frame:post_url': `${baseUrl}/api/frame`,
      'fc:frame:state': JSON.stringify({ referralCode: code }),
    },
  }
}

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-600 via-orange-500 to-yellow-400 p-6">
      <div className="bg-white rounded-3xl border-4 border-black p-8 max-w-md text-center shadow-2xl space-y-6">
        <div>
          <p className="text-sm font-semibold text-red-500 uppercase tracking-widest mb-1">
            Pizza Party Invitation
          </p>
          <h1 className="text-4xl font-black text-red-700">🍕 Join the Party 🍕</h1>
        </div>
        <p className="text-lg text-gray-700">
          You&apos;ve been invited with referral code:
        </p>
        <div className="bg-yellow-100 border-4 border-yellow-400 rounded-2xl p-4">
          <p className="text-3xl font-black text-yellow-900 tracking-widest">
            {code.toUpperCase()}
          </p>
        </div>
        <p className="text-gray-700">
          Use this code to earn bonus toppings and improve your odds of winning the weekly jackpot!
        </p>
        <a
          href={`/?ref=${code}`}
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-2xl border-4 border-green-900 transition-colors shadow-lg"
        >
          🍕 Join Pizza Party 🍕
        </a>
      </div>
    </main>
  )
}
