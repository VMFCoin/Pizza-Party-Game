import { NextRequest, NextResponse } from 'next/server'

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!
const REQUIRED_EMBED = 'farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

// Hard backstop ceiling — cast must be < 2 minutes old.
// Primary check is the per-session timestamp passed from the frontend.
const MAX_AGE_MS = 2 * 60 * 1000

async function fetchCastFromNeynar(castHash: string) {
  const url = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(castHash)}&type=hash`
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': NEYNAR_API_KEY,
      api_key: NEYNAR_API_KEY,
    },
  })
  console.log('[share/verify-cast] Neynar response status:', res.status, res.statusText)
  return res
}

export async function POST(req: NextRequest) {
  try {
    const { castHash, playerAddress, playerFid, shareSessionStartMs } = await req.json() as {
      castHash:             string
      playerAddress:        string
      playerFid:            number
      shareSessionStartMs?: number
    }

    if (!castHash || !playerAddress || !playerFid) {
      return NextResponse.json(
        { blocked: true, reason: 'Missing required fields. Make sure you posted before verifying.' },
        { status: 400 }
      )
    }

    console.log('[share/verify-cast] === START ===', { castHash, playerFid, shareSessionStartMs })

    // Try fetching cast — retry once after 3s if not found (propagation delay)
    let neynarRes = await fetchCastFromNeynar(castHash)
    if (!neynarRes.ok) {
      const errText1 = await neynarRes.text().catch(() => 'unknown')
      console.log('[share/verify-cast] First attempt failed:', neynarRes.status, errText1)
      await new Promise(r => setTimeout(r, 3000))
      neynarRes = await fetchCastFromNeynar(castHash)
    }

    if (!neynarRes.ok) {
      const errText = await neynarRes.text().catch(() => 'unknown')
      console.error('[share/verify-cast] FAILED after retry:', neynarRes.status, errText)
      return NextResponse.json({
        blocked: true,
        reason: `Cast not found. Make sure you posted before claiming. (Status: ${neynarRes.status})`,
      })
    }

    const data = await neynarRes.json()
    const cast = data?.cast
    if (!cast) {
      console.error('[share/verify-cast] No cast in response:', JSON.stringify(data).slice(0, 500))
      return NextResponse.json({ blocked: true, reason: 'Cast not found in response.' })
    }

    // FID match
    if (Number(cast?.author?.fid) !== Number(playerFid)) {
      console.log('[share/verify-cast] FID mismatch:', cast?.author?.fid, 'vs', playerFid)
      return NextResponse.json({
        blocked: true,
        reason: `Cast was not posted by your Farcaster account.`,
      })
    }

    // Embed match
    const embeds: Array<{ url?: string }> = cast?.embeds ?? []
    if (!embeds.some((e) => e?.url?.includes(REQUIRED_EMBED))) {
      console.log('[share/verify-cast] Missing embed. Looking for:', REQUIRED_EMBED)
      return NextResponse.json({
        blocked: true,
        reason: 'Cast must include the Pizza Party link.',
      })
    }

    const castTimestampMs = new Date(cast.timestamp).getTime()
    const ageMs = Date.now() - castTimestampMs
    console.log('[share/verify-cast] Cast age (s):', Math.round(ageMs / 1000))

    // Layer 1: per-session check — cast must be posted AFTER user clicked SHARE this session
    if (typeof shareSessionStartMs === 'number' && shareSessionStartMs > 0) {
      // Allow 60s of clock skew either direction
      const SKEW_MS = 60 * 1000
      if (castTimestampMs < shareSessionStartMs - SKEW_MS) {
        console.log('[share/verify-cast] Session check failed:',
          'castTs=', castTimestampMs, 'sessionStart=', shareSessionStartMs)
        return NextResponse.json({
          blocked: true,
          reason: 'Please share again, then verify immediately.',
        })
      }
    }

    // Layer 2: hard ceiling — cast must be < 2 minutes old
    if (ageMs > MAX_AGE_MS) {
      return NextResponse.json({
        blocked: true,
        reason: 'Please share again, then verify immediately.',
      })
    }

    console.log('[share/verify-cast] === VERIFIED ===', castHash)
    return NextResponse.json({ verified: true, castHash })

  } catch (err) {
    console.error('[share/verify-cast] Unexpected error:', err)
    return NextResponse.json({
      verified: true,
      warning: 'Verification soft-failed, proceeding.',
    })
  }
}
