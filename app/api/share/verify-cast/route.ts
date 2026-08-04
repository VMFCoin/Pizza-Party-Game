import { NextRequest, NextResponse } from 'next/server'

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!
const REQUIRED_EMBED = 'farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'

// Hard backstop ceiling — cast must be < 2 minutes old.
// Primary check is the per-session timestamp passed from the frontend.
const MAX_AGE_MS = 2 * 60 * 1000

interface NeynarCast {
  hash?:      string
  timestamp?: string
  author?:    { fid?: number }
  embeds?:    Array<{ url?: string }>
}

function hasRequiredEmbed(cast: NeynarCast): boolean {
  const embeds = cast?.embeds ?? []
  return embeds.some((e) => e?.url?.includes(REQUIRED_EMBED))
}

async function fetchCastFromNeynar(castHash: string) {
  const url = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(castHash)}&type=hash`
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': NEYNAR_API_KEY,
      api_key: NEYNAR_API_KEY,
    },
  })
  console.log('[share/verify-cast] Neynar cast-by-hash status:', res.status, res.statusText)
  return res
}

// Fallback path when the miniapp SDK didn't return a usable cast hash.
// Pull the player's recent casts and find the Pizza Party share posted this session.
async function findRecentShareByFid(
  playerFid:           number,
  shareSessionStartMs: number | undefined,
): Promise<NeynarCast | null> {
  const url = `https://api.neynar.com/v2/farcaster/feed/user/casts/?fid=${playerFid}&limit=25&include_replies=false`
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': NEYNAR_API_KEY,
      api_key: NEYNAR_API_KEY,
    },
  })
  console.log('[share/verify-cast] Neynar user-casts status:', res.status, res.statusText)
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    console.log('[share/verify-cast] user-casts fetch failed:', res.status, errText)
    return null
  }

  const data = await res.json()
  const casts: NeynarCast[] = data?.casts ?? []
  console.log('[share/verify-cast] user-casts returned:', casts.length)

  // Only look back as far as the session start (with skew) — never match an old share.
  const SKEW_MS = 60 * 1000
  const floorMs = typeof shareSessionStartMs === 'number' && shareSessionStartMs > 0
    ? shareSessionStartMs - SKEW_MS
    : Date.now() - MAX_AGE_MS

  // Casts come newest-first; take the first one that carries our embed and is recent enough.
  for (const cast of casts) {
    if (Number(cast?.author?.fid) !== Number(playerFid)) continue
    if (!hasRequiredEmbed(cast)) continue
    const ts = cast?.timestamp ? new Date(cast.timestamp).getTime() : 0
    if (!ts || ts < floorMs) continue
    console.log('[share/verify-cast] fallback matched cast:', cast.hash, 'ts:', cast.timestamp)
    return cast
  }
  console.log('[share/verify-cast] fallback found no matching recent share')
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { castHash, playerAddress, playerFid, shareSessionStartMs } = await req.json() as {
      castHash?:            string | null
      playerAddress:        string
      playerFid:            number
      shareSessionStartMs?: number
    }

    // castHash may be missing — the miniapp SDK often returns no hash even on a
    // successful post. We can still verify via the FID recent-casts fallback.
    if (!playerAddress || !playerFid) {
      return NextResponse.json(
        { blocked: true, reason: 'Missing required fields. Make sure you posted before verifying.' },
        { status: 400 }
      )
    }

    console.log('[share/verify-cast] === START ===', { castHash, playerFid, shareSessionStartMs })

    let cast: NeynarCast | null = null

    // Path 1: we have a hash — look it up directly (retry once for propagation delay).
    if (castHash) {
      let neynarRes = await fetchCastFromNeynar(castHash)
      if (!neynarRes.ok) {
        const errText1 = await neynarRes.text().catch(() => 'unknown')
        console.log('[share/verify-cast] First attempt failed:', neynarRes.status, errText1)
        await new Promise(r => setTimeout(r, 3000))
        neynarRes = await fetchCastFromNeynar(castHash)
      }
      if (neynarRes.ok) {
        const data = await neynarRes.json()
        cast = data?.cast ?? null
        if (!cast) {
          console.error('[share/verify-cast] No cast in by-hash response:', JSON.stringify(data).slice(0, 500))
        }
      } else {
        const errText = await neynarRes.text().catch(() => 'unknown')
        console.log('[share/verify-cast] by-hash failed after retry, trying FID fallback:', neynarRes.status, errText)
      }
    }

    // Path 2: no usable cast from the hash — fall back to the player's recent casts.
    if (!cast) {
      console.log('[share/verify-cast] Using FID recent-casts fallback for', playerFid)
      cast = await findRecentShareByFid(playerFid, shareSessionStartMs)
    }

    if (!cast) {
      console.error('[share/verify-cast] No cast found via hash or FID fallback')
      return NextResponse.json({
        blocked: true,
        reason: 'Cast not found. Make sure you posted before claiming.',
      })
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
    if (!hasRequiredEmbed(cast)) {
      console.log('[share/verify-cast] Missing embed. Looking for:', REQUIRED_EMBED)
      return NextResponse.json({
        blocked: true,
        reason: 'Cast must include the Pizza Party link.',
      })
    }

    const castTimestampMs = cast.timestamp ? new Date(cast.timestamp).getTime() : 0
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

    // Return the resolved hash so the on-chain dedup uses the real cast hash,
    // even when the frontend never captured it from the SDK.
    const resolvedHash = cast.hash ?? castHash ?? null
    console.log('[share/verify-cast] === VERIFIED ===', resolvedHash)
    return NextResponse.json({ verified: true, castHash: resolvedHash })

  } catch (err) {
    console.error('[share/verify-cast] Unexpected error:', err)
    return NextResponse.json({
      verified: true,
      warning: 'Verification soft-failed, proceeding.',
    })
  }
}
