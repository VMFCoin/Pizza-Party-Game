/**
 * Neynar user quality score gate.
 *
 * Neynar scores are 0–1 (API: experimental.neynar_user_score).
 * Product threshold of "22" maps to 0.22 on that scale.
 * Used to block bot / low-quality Farcaster accounts from:
 *   - entering the daily game
 *   - Share & Spin
 *   - claiming toppings for the weekly game
 */

export const MIN_NEYNAR_USER_SCORE = 0.22

export const NEYNAR_SCORE_BLOCKED_MESSAGE =
  'Your Neynar score is too low to play Pizza Party. You need a score of 0.22 (22) or higher. Keep casting quality content on Farcaster to raise your score.'

export type NeynarScoreCheck =
  | { ok: true; score: number }
  | { ok: false; score: number | null; reason: string }

function getNeynarApiKey(): string | undefined {
  return process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY
}

function extractScore(user: unknown): number | null {
  if (!user || typeof user !== 'object') return null
  const experimental = (user as { experimental?: { neynar_user_score?: unknown } }).experimental
  const raw = experimental?.neynar_user_score
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw)
  }
  return null
}

export function meetsMinNeynarScore(score: number | null | undefined): boolean {
  return typeof score === 'number' && Number.isFinite(score) && score >= MIN_NEYNAR_USER_SCORE
}

/** Fetch Neynar user score for a FID. Returns null if unavailable. */
export async function fetchNeynarUserScoreByFid(fid: number): Promise<number | null> {
  if (!fid || !Number.isFinite(fid) || fid <= 0) return null

  const apiKey = getNeynarApiKey()
  if (!apiKey) {
    console.error('[neynarScore] NEYNAR_API_KEY not configured')
    return null
  }

  const res = await fetch(
    `https://api.neynar.com/v2/farcaster/user/bulk?fids=${Math.floor(fid)}`,
    {
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        api_key: apiKey,
      },
      // Scores update ~weekly; short cache is fine for API route reuse within a request.
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    console.error('[neynarScore] bulk user fetch failed:', res.status, errText)
    return null
  }

  const data = await res.json()
  const user = Array.isArray(data?.users) ? data.users[0] : null
  return extractScore(user)
}

/**
 * Server-side gate. Fail closed: missing FID, missing score, or API failure → blocked.
 */
export async function requireNeynarScore(fid: number | null | undefined): Promise<NeynarScoreCheck> {
  if (!fid || !Number.isFinite(fid) || fid <= 0) {
    return {
      ok: false,
      score: null,
      reason: 'Farcaster account required. Open Pizza Party from a Farcaster client to play.',
    }
  }

  const score = await fetchNeynarUserScoreByFid(fid)
  if (score === null) {
    return {
      ok: false,
      score: null,
      reason: 'Could not verify your Neynar score. Please try again in a moment.',
    }
  }

  if (!meetsMinNeynarScore(score)) {
    return {
      ok: false,
      score,
      reason: NEYNAR_SCORE_BLOCKED_MESSAGE,
    }
  }

  return { ok: true, score }
}
