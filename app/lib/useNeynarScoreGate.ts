'use client'

import { useEffect, useState } from 'react'
import { MIN_NEYNAR_USER_SCORE, NEYNAR_SCORE_BLOCKED_MESSAGE } from '@/app/lib/neynarScore'

export type NeynarScoreGateState = {
  /** True until the first score check finishes (or FID context is still loading). */
  loading: boolean
  score: number | null
  /** False when score is missing/too low or FID is missing. Fail closed for play actions. */
  allowed: boolean
  reason: string | null
}

const INITIAL: NeynarScoreGateState = {
  loading: true,
  score: null,
  allowed: false,
  reason: null,
}

/**
 * Client-side Neynar score gate for daily enter / Share & Spin / claim toppings.
 * Fail closed: no FID or score below min → not allowed.
 *
 * Pass `ready: false` until the Farcaster context FID lookup has finished so the
 * UI stays on "checking" instead of flashing a false "score too low" state.
 */
export function useNeynarScoreGate(
  fid: number | null | undefined,
  options?: { ready?: boolean }
): NeynarScoreGateState {
  const ready = options?.ready ?? true
  const [state, setState] = useState<NeynarScoreGateState>(INITIAL)

  useEffect(() => {
    let cancelled = false

    if (!ready) {
      setState(INITIAL)
      return
    }

    if (!fid || !Number.isFinite(fid) || fid <= 0) {
      setState({
        loading: false,
        score: null,
        allowed: false,
        reason: 'Farcaster account required. Open Pizza Party from a Farcaster client to play.',
      })
      return
    }

    setState((prev) => ({ ...prev, loading: true }))

    const run = async () => {
      try {
        const res = await fetch(`/api/users/neynar-score?fid=${Math.floor(fid)}`, {
          cache: 'no-store',
        })
        const data = await res.json().catch(() => null)
        if (cancelled) return

        const score = typeof data?.score === 'number' ? data.score : null
        const allowed = Boolean(data?.allowed)
        setState({
          loading: false,
          score,
          allowed,
          reason: allowed
            ? null
            : (typeof data?.reason === 'string' && data.reason) ||
              (typeof data?.message === 'string' && data.message) ||
              NEYNAR_SCORE_BLOCKED_MESSAGE,
        })
      } catch (err) {
        console.error('[useNeynarScoreGate] fetch failed:', err)
        if (cancelled) return
        setState({
          loading: false,
          score: null,
          allowed: false,
          reason: 'Could not verify your Neynar score. Please try again in a moment.',
        })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [fid, ready])

  return state
}

export { MIN_NEYNAR_USER_SCORE, NEYNAR_SCORE_BLOCKED_MESSAGE }
