import { NextRequest, NextResponse } from 'next/server'

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!
const REQUIRED_EMBED = 'farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'
const MAX_AGE_MS     = 10 * 60 * 1000  // cast must be < 10 minutes old

export async function POST(req: NextRequest) {
  try {
    const { castHash, playerAddress, playerFid } = await req.json() as {
      castHash:      string
      playerAddress: string
      playerFid:     number
    }

    if (!castHash || !playerAddress || !playerFid) {
      return NextResponse.json(
        { blocked: true, reason: 'Missing required fields.' },
        { status: 400 }
      )
    }

    // Fetch cast from Neynar
    const neynarRes = await fetch(
      `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(castHash)}&type=hash`,
      {
        headers: {
          accept: 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    )

    if (!neynarRes.ok) {
      return NextResponse.json({
        blocked: true,
        reason: 'Cast not found. Make sure you posted before claiming.',
      })
    }

    const { cast } = await neynarRes.json()

    if (!cast) {
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

    return NextResponse.json({ verified: true, castHash })

  } catch (err) {
    console.error('[share/verify-cast]', err)
    // Soft-fail — don't block users due to our infra issues
    return NextResponse.json({
      verified: true,
      warning: 'Verification soft-failed, proceeding.',
    })
  }
}
