import { NextRequest, NextResponse } from 'next/server'

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!
const REQUIRED_EMBED = 'farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party'
const MAX_AGE_MS     = 10 * 60 * 1000  // cast must be < 10 minutes old

async function fetchCastFromNeynar(castHash: string) {
  console.log('[share/verify-cast] Neynar API key present:', !!NEYNAR_API_KEY, 'length:', NEYNAR_API_KEY?.length ?? 0)

  const url = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(castHash)}&type=hash`
  console.log('[share/verify-cast] Fetching:', url)

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
    const { castHash, playerAddress, playerFid } = await req.json() as {
      castHash:      string
      playerAddress: string
      playerFid:     number
    }

    if (!castHash || !playerAddress || !playerFid) {
      console.log('[share/verify-cast] Missing fields:', { castHash: !!castHash, playerAddress: !!playerAddress, playerFid: !!playerFid })
      return NextResponse.json(
        { blocked: true, reason: 'Missing required fields. Make sure you posted before verifying.' },
        { status: 400 }
      )
    }

    console.log('[share/verify-cast] === START VERIFICATION ===')
    console.log('[share/verify-cast] castHash:', castHash)
    console.log('[share/verify-cast] playerFid:', playerFid)
    console.log('[share/verify-cast] playerAddress:', playerAddress)

    // Try fetching cast — retry once after 3s if not found (propagation delay)
    let neynarRes = await fetchCastFromNeynar(castHash)

    if (!neynarRes.ok) {
      const errText1 = await neynarRes.text().catch(() => 'unknown')
      console.log('[share/verify-cast] First attempt failed:', neynarRes.status, errText1)
      console.log('[share/verify-cast] Retrying in 3s...')
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
    console.log('[share/verify-cast] Neynar response keys:', Object.keys(data))

    const cast = data?.cast
    if (!cast) {
      console.error('[share/verify-cast] No cast in response:', JSON.stringify(data).slice(0, 500))
      return NextResponse.json({ blocked: true, reason: 'Cast not found in response.' })
    }

    console.log('[share/verify-cast] Cast author FID:', cast?.author?.fid, 'Expected FID:', playerFid)

    // Confirm cast was posted by this FID
    if (Number(cast?.author?.fid) !== Number(playerFid)) {
      console.log('[share/verify-cast] FID mismatch! Cast author:', cast?.author?.fid, 'Player:', playerFid)
      return NextResponse.json({
        blocked: true,
        reason: `Cast was not posted by your Farcaster account. (Cast FID: ${cast?.author?.fid}, Your FID: ${playerFid})`,
      })
    }

    // Confirm cast contains the Pizza Party embed
    const embeds: Array<{ url?: string }> = cast?.embeds ?? []
    console.log('[share/verify-cast] Cast embeds:', JSON.stringify(embeds))

    if (!embeds.some((e) => e?.url?.includes(REQUIRED_EMBED))) {
      console.log('[share/verify-cast] Missing required embed. Looking for:', REQUIRED_EMBED)
      return NextResponse.json({
        blocked: true,
        reason: 'Cast must include the Pizza Party link.',
      })
    }

    // Confirm cast is recent (< 10 minutes old)
    const ageMs = Date.now() - new Date(cast.timestamp).getTime()
    console.log('[share/verify-cast] Cast age:', Math.round(ageMs / 1000), 'seconds')

    if (ageMs > MAX_AGE_MS) {
      return NextResponse.json({
        blocked: true,
        reason: `Cast is too old (${Math.round(ageMs / 60000)} min). Share again to claim.`,
      })
    }

    console.log('[share/verify-cast] === VERIFIED SUCCESSFULLY ===', castHash)
    return NextResponse.json({ verified: true, castHash })

  } catch (err) {
    console.error('[share/verify-cast] Unexpected error:', err)
    return NextResponse.json({
      verified: true,
      warning: 'Verification soft-failed, proceeding.',
    })
  }
}
