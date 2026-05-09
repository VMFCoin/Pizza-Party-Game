// GET /api/cron/tip-poll
//
// Poll Neynar for new tip casts from allowlisted FIDs.
// Same pattern as our other crons (auth via x-vercel-cron or CRON_SECRET).
//
// Why polling instead of webhook:
//   - Neynar webhooks require a paid plan
//   - Cron is free (Vercel) and uses the free Neynar API endpoints
//
// Frequency: configured in vercel.json. Recommended: every 1-2 minutes.
//
// What it does for each allowlisted FID:
//   1. Fetch their latest 25 casts via Neynar /feed/user/casts (free tier)
//   2. For each cast that is a REPLY and contains a tip pattern:
//      a. Skip if cast hash already in `tip_casts` table (already processed)
//      b. Skip if cast is older than 10 min
//      c. Resolve recipient FID + wallet via Neynar /user/bulk
//      d. Hit /api/tip/execute which runs the full 11-gate verification
//   3. Returns a summary

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { TIP_ALLOWLIST_FIDS } from '@/app/lib/constants/tipAccess';
import { parseTipCast } from '@/app/lib/tipping/parseTipCast';

export const maxDuration = 60;

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
// 24 hours — tipping is replay-protected on-chain via usedCastHashes
// AND in DB via TipCast.castHash unique. Age limit is just to bound the
// search window, not a security gate. (Share & Spin uses 10min because
// that's a different anti-fraud signal.)
const MAX_CAST_AGE_MS = 24 * 60 * 60 * 1000;

// ============================================================
// Neynar helpers (free-tier endpoints only)
// ============================================================

interface NeynarCast {
  hash: string;
  text: string;
  timestamp: string;
  parent_hash: string | null;
  parent_author?: { fid?: number };
  author: {
    fid: number;
    username?: string;
    verified_addresses?: {
      primary?: { eth_address?: string | null };
      eth_addresses?: string[];
    };
  };
}

async function fetchUserCasts(fid: number, limit = 25): Promise<NeynarCast[]> {
  const url = `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${fid}&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': NEYNAR_API_KEY,
      api_key: NEYNAR_API_KEY,
    },
  });
  if (!res.ok) {
    console.error('[tip-poll] feed/user/casts failed for fid', fid, res.status);
    return [];
  }
  const data = await res.json();
  return (data?.casts || []) as NeynarCast[];
}

async function fetchUserByFid(fid: number): Promise<{ wallet?: string; username?: string } | null> {
  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': NEYNAR_API_KEY,
      api_key: NEYNAR_API_KEY,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const u = (data?.users || [])[0];
  if (!u) return null;
  const wallet = u.verified_addresses?.primary?.eth_address || u.verified_addresses?.eth_addresses?.[0];
  return { wallet, username: u.username };
}

// ============================================================
// Route
// ============================================================

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const cronSecret = process.env.CRON_SECRET;
  if (cronHeader !== '1' && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!NEYNAR_API_KEY) {
    return NextResponse.json({ error: 'NEYNAR_API_KEY not set' }, { status: 500 });
  }

  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || '';
  const executeUrl = `${proto}://${host}/api/tip/execute`;

  const summary = {
    polledFids: TIP_ALLOWLIST_FIDS.length,
    castsScanned: 0,
    tipPatternsFound: 0,
    alreadyProcessed: 0,
    tooOld: 0,
    notReply: 0,
    executeAttempts: 0,
    executeOk: 0,
    executeRejected: 0,
    executeError: 0,
    errors: [] as string[],
  };

  // For each allowlisted FID, fetch recent casts
  for (const fid of TIP_ALLOWLIST_FIDS) {
    let casts: NeynarCast[];
    try {
      casts = await fetchUserCasts(fid, 25);
    } catch (e) {
      summary.errors.push(`fetch fid=${fid}: ${e instanceof Error ? e.message : 'unknown'}`);
      continue;
    }
    summary.castsScanned += casts.length;

    for (const cast of casts) {
      // Must be a reply
      if (!cast.parent_hash) {
        summary.notReply++;
        continue;
      }

      // Must contain a tip pattern
      const parsed = parseTipCast(cast.text);
      if (!parsed) continue;
      summary.tipPatternsFound++;

      // Age check
      const ageMs = Date.now() - new Date(cast.timestamp).getTime();
      if (Number.isNaN(ageMs) || ageMs > MAX_CAST_AGE_MS) {
        summary.tooOld++;
        continue;
      }

      // DB dedup (cheap before any further work)
      const padded = `0x${cast.hash.replace(/^0x/, '').padEnd(64, '0')}`;
      const existing = await prisma.tipCast.findUnique({
        where: { castHash: padded },
      });
      if (existing) {
        summary.alreadyProcessed++;
        continue;
      }

      // Resolve sender wallet from cast payload
      const fromWallet =
        cast.author.verified_addresses?.primary?.eth_address ||
        cast.author.verified_addresses?.eth_addresses?.[0];
      if (!fromWallet) continue;

      // Resolve recipient wallet via Neynar (parent_author has FID only)
      const toFid = cast.parent_author?.fid;
      if (!toFid || toFid <= 0) continue;
      const recipient = await fetchUserByFid(toFid);
      if (!recipient?.wallet) continue;

      // Hand off to /api/tip/execute (which runs all 11 gates again).
      // After it returns, sleep briefly to let the tx propagate before the
      // NEXT cast — this avoids same-nonce collisions when the cron processes
      // multiple casts back-to-back. Belt-and-suspenders: /api/tip/execute
      // also reads pending nonce explicitly.
      summary.executeAttempts++;
      try {
        const execRes = await fetch(executeUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            cast: {
              hash: cast.hash,
              text: cast.text,
              timestamp: cast.timestamp,
              parent_hash: cast.parent_hash,
              parent_fid: toFid,
              author: { fid: cast.author.fid, username: cast.author.username },
            },
            fromWallet,
            fromFid: cast.author.fid,
            fromUsername: cast.author.username,
            toWallet: recipient.wallet,
            toFid,
            toUsername: recipient.username,
          }),
        });
        const execJson = await execRes.json();
        if (execJson?.ok) summary.executeOk++;
        else if (execJson?.reason) summary.executeRejected++;
        else summary.executeError++;
        // Pause 3s before next cast — gives the just-broadcast tx time to
        // be picked up by RPC's pending pool, so the next nonce read is correct.
        await new Promise((r) => setTimeout(r, 3000));
      } catch (e) {
        summary.executeError++;
        summary.errors.push(`execute cast=${cast.hash.slice(0, 10)}: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
  }

  return NextResponse.json({ ok: true, summary });
}
