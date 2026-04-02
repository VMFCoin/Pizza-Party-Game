import { NextRequest, NextResponse } from 'next/server'

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!
const REQUIRED_EMBED = 'farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'
const MAX_AGE_MS     = 10 * 60 * 1000  // cast must be < 10 minutes old

async function fetchCastFromNeynar(castHash: string) {
  const res = await fetch(
    `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(castHash)}&type=hash`,
    {
      headers: {
        accept: 'application/json',
        api_key: NEYNAR_API_KEY,
      },
    }
  )
  return res
}

export async function POST(req: NextRequest) {
  try {
    const { castHash, playerAddress, playerFid } = await req.json() as {
      castHash:      string
      playerAddress: string
      playerFid:     number
    }

    if (!castHash || !playerAddress || !playerFid) {
      return NextResponse.json(
        { blocked: true, reason: 'Missing required fields. Make sure you posted before verifying.' },
        { status: 400 }
      )
    }

    console.log('[share/verify-cast] Verifying cast:', { castHash, playerFid })

    // Try fetching cast — retry once after 3s if not found (propagation delay)
    let neynarRes = await fetchCastFromNeynar(castHash)

    if (!neynarRes.ok) {
      console.log('[share/verify-cast] First attempt failed, retrying in 3s...')
      await new Promise(r => setTimeout(r, 3000))
      neynarRes = await fetchCastFromNeynar(castHash)
    }

    if (!neynarRes.ok) {
      const errText = await neynarRes.text().catch(() => 'unknown')
      console.error('[share/verify-cast] Neynar error:', neynarRes.status, errText)
      return NextResponse.json({
        blocked: true,
        reason: 'Cast not found. Make sure you posted before claiming.',
      })
    }

    const data = await neynarRes.json()
    const cast = data?.cast

    if (!cast) {
      console.error('[share/verify-cast] No cast in response:', JSON.stringify(data).slice(0, 200))
      return NextResponse.json({ blocked: true, reason: 'Cast not found.' })
    }

    // Confirm cast was posted by this FID
    if (Number(cast?.author?.fid) !== Number(playerFid)) {
      return NextResponse.json({
        blocked: true,
        reason: 'Cast was not posted by your Farcaster account.',
      })
    }

    // Confirm cast contains the Pizza Party embed
    const embeds: Array<{ url?: string }> = cast?.embeds ?? []
    if (!embeds.some((e) => e?.url?.includes(REQUIRED_EMBED))) {
      return NextResponse.json({
        blocked: true,
        reason: 'Cast must include the Pizza Party link.',
      })
    }

    // Confirm cast is recent (< 10 minutes old)
    const ageMs = Date.now() - new Date(cast.timestamp).getTime()
    if (ageMs > MAX_AGE_MS) {
      return NextResponse.json({
        blocked: true,
        reason: 'Cast is too old. Share again to claim.',
      })
    }

    console.log('[share/verify-cast] Verified successfully:', castHash)
    return NextResponse.json({ verified: true, castHash })

  } catch (err) {
    console.error('[share/verify-cast] Unexpected error:', err)
    // Soft-fail on unexpected errors only (not verification failures)
    return NextResponse.json({
      verified: true,
      warning: 'Verification soft-failed, proceeding.',
    })
  }
}
