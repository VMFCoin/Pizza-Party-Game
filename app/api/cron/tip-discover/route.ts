// GET /api/cron/tip-discover
//
// Phase 1 of 3-stage tipping architecture.
// Scans Neynar for new tip casts from allowlisted FIDs and writes `pending`
// rows into the tip_casts table. Does ZERO on-chain work — fast and idempotent.
//
// Schedule: every 5 min (low frequency, won't hammer Neynar free tier).
//
// The worker cron (every 1 min) drains the pending queue separately.
// The reconciler (every 5 min) catches lost txs.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { TIP_ALLOWLIST_FIDS } from '@/app/lib/constants/tipAccess';
import { isFidBanned, isAddressBanned } from '@/app/lib/constants/banList';
import { parseTipCast } from '@/app/lib/tipping/parseTipCast';

export const maxDuration = 60;

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
// 30 days — replay protection is enforced on-chain (usedCastHashes mapping)
// and in DB (unique castHash). Age limit just bounds the search window.
const MAX_CAST_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_TIP_WEI = 1_000n * 10n ** 18n;
const MAX_TIP_WEI = 10_000_000n * 10n ** 18n;

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
    console.error('[tip-discover] feed failed for fid', fid, res.status);
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

function castHashToBytes32(castHash: string): `0x${string}` | null {
  if (typeof castHash !== 'string' || !castHash.startsWith('0x')) return null;
  const raw = castHash.slice(2);
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length > 64) return null;
  return `0x${raw.padEnd(64, '0')}` as `0x${string}`;
}

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

  const summary = {
    polledFids: TIP_ALLOWLIST_FIDS.length,
    castsScanned: 0,
    enqueued: 0,
    rejected: {
      notReply: 0,
      noPattern: 0,
      tooOld: 0,
      amountOutOfRange: 0,
      selfTip: 0,
      banned: 0,
      noWallet: 0,
      noFid: 0,
      alreadyExists: 0,
    },
    errors: [] as string[],
  };

  for (const fid of TIP_ALLOWLIST_FIDS) {
    let casts: NeynarCast[];
    try {
      casts = await fetchUserCasts(fid, 25);
    } catch (e) {
      summary.errors.push(`feed fid=${fid}: ${e instanceof Error ? e.message : 'unknown'}`);
      continue;
    }
    summary.castsScanned += casts.length;

    for (const cast of casts) {
      if (!cast.parent_hash) {
        summary.rejected.notReply++;
        continue;
      }

      const parsed = parseTipCast(cast.text);
      if (!parsed) {
        summary.rejected.noPattern++;
        continue;
      }

      const ageMs = Date.now() - new Date(cast.timestamp).getTime();
      if (Number.isNaN(ageMs) || ageMs > MAX_CAST_AGE_MS) {
        summary.rejected.tooOld++;
        continue;
      }

      if (parsed.amountWei < MIN_TIP_WEI || parsed.amountWei > MAX_TIP_WEI) {
        summary.rejected.amountOutOfRange++;
        continue;
      }

      const padded = castHashToBytes32(cast.hash);
      if (!padded) {
        summary.errors.push(`bad cast hash ${cast.hash}`);
        continue;
      }

      const existing = await prisma.tipCast.findUnique({ where: { castHash: padded } });
      if (existing) {
        summary.rejected.alreadyExists++;
        continue;
      }

      const fromWallet =
        cast.author.verified_addresses?.primary?.eth_address ||
        cast.author.verified_addresses?.eth_addresses?.[0];
      if (!fromWallet) {
        summary.rejected.noWallet++;
        continue;
      }
      if (isAddressBanned(fromWallet) || isFidBanned(cast.author.fid)) {
        summary.rejected.banned++;
        continue;
      }

      const toFid = cast.parent_author?.fid;
      if (!toFid || toFid <= 0) {
        summary.rejected.noFid++;
        continue;
      }

      const recipient = await fetchUserByFid(toFid);
      if (!recipient?.wallet) {
        summary.rejected.noWallet++;
        continue;
      }

      if (fromWallet.toLowerCase() === recipient.wallet.toLowerCase()) {
        summary.rejected.selfTip++;
        continue;
      }
      if (isAddressBanned(recipient.wallet) || isFidBanned(toFid)) {
        summary.rejected.banned++;
        continue;
      }

      // Enqueue as pending — worker drains this
      try {
        await prisma.tipCast.create({
          data: {
            castHash: padded,
            fromWallet: fromWallet.toLowerCase(),
            fromFid: cast.author.fid,
            fromUsername: cast.author.username,
            toWallet: recipient.wallet.toLowerCase(),
            toFid,
            toUsername: recipient.username,
            amount: parsed.amountWei.toString(),
            status: 'pending',
            castTimestamp: new Date(cast.timestamp),
            parentCastHash: cast.parent_hash ?? null,
          },
        });
        summary.enqueued++;
      } catch {
        // Race: another discover run inserted same hash. Idempotent — count it.
        summary.rejected.alreadyExists++;
      }
    }
  }

  return NextResponse.json({ ok: true, summary });
}
