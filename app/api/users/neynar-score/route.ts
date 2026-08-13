import { NextRequest, NextResponse } from 'next/server'
import {
  MIN_NEYNAR_USER_SCORE,
  NEYNAR_SCORE_BLOCKED_MESSAGE,
  meetsMinNeynarScore,
  requireNeynarScore,
} from '@/app/lib/neynarScore'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users/neynar-score?fid=123
 * Returns whether the FID meets the minimum Neynar user score to play.
 */
export async function GET(req: NextRequest) {
  try {
    const fidParam = req.nextUrl.searchParams.get('fid')
    const fid = fidParam ? Number(fidParam) : NaN

    if (!fidParam || !Number.isFinite(fid) || fid <= 0) {
      return NextResponse.json(
        {
          allowed: false,
          score: null,
          minScore: MIN_NEYNAR_USER_SCORE,
          reason: 'Valid fid query param required',
        },
        { status: 400 }
      )
    }

    const check = await requireNeynarScore(fid)

    return NextResponse.json({
      allowed: check.ok,
      score: check.score,
      minScore: MIN_NEYNAR_USER_SCORE,
      reason: check.ok ? null : check.reason,
      message: check.ok ? null : (check.reason || NEYNAR_SCORE_BLOCKED_MESSAGE),
      meetsMin: meetsMinNeynarScore(check.score),
    })
  } catch (err) {
    console.error('[api/users/neynar-score] error:', err)
    return NextResponse.json(
      {
        allowed: false,
        score: null,
        minScore: MIN_NEYNAR_USER_SCORE,
        reason: 'Failed to check Neynar score',
      },
      { status: 500 }
    )
  }
}
