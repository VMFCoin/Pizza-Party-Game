import { NextRequest, NextResponse } from 'next/server'

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_BASE_URL || 'https://pizza-party-game.vmfcoin.com'

const frameHtml = (image: string, buttonText: string, target: string) => `<!DOCTYPE html>
<html>
  <head>
    <meta property="fc:frame" content="vNext" />
    <meta property="fc:frame:image" content="${image}" />
    <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
    <meta property="fc:frame:button:1" content="${buttonText}" />
    <meta property="fc:frame:button:1:action" content="link" />
    <meta property="fc:frame:button:1:target" content="${target}" />
  </head>
  <body>
    <p>Pizza Party Frame</p>
  </body>
</html>`

export async function POST(req: NextRequest) {
  const baseUrl = getBaseUrl()
  try {
    const body = await req.json()
    const { untrustedData } = body ?? {}
    const state = untrustedData?.state ? JSON.parse(untrustedData.state) : {}
    const referralCode = state.referralCode ?? ''

    const thankYouImage = `${baseUrl}/images/frame-thankyou.png`
    const target = `${baseUrl}${referralCode ? `/?ref=${referralCode}` : ''}`

    return new NextResponse(frameHtml(thankYouImage, '🎮 Play Now', target), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('Frame handler error', error)
    const errorImage = `${getBaseUrl()}/images/frame-error.png`
    return new NextResponse(frameHtml(errorImage, '🍕 Try Again', getBaseUrl()), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Pizza Party Frame API',
    version: 'vNext',
    baseUrl: getBaseUrl(),
  })
}
