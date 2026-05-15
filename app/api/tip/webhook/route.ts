// POST /api/tip/webhook
//
// Receives `cast.created` events from Neynar in real time.
// Runs all the same gates as the polling cron, then enqueues the cast as
// `pending` in the tip_casts table. The tip-worker cron then picks it up and
// executes on chain within ~1-2 minutes.
//
// Why we enqueue instead of executing inline:
//   - Webhook responses must be fast (<2s ideally) or Neynar retries
//   - Multiple webhooks may fire in parallel; queueing serializes them through
//     the existing worker which already handles nonce management
//   - Failure recovery: if vault tx fails, worker retries; webhook stays idempotent
//
// Security:
//   - HMAC-SHA512 signature on `x-neynar-signature` header (Neynar advanced sig)
//   - Falls back to header `x-webhook-signature` if "simple" signing chosen
//   - If NEYNAR_WEBHOOK_SECRET not set, requests are rejected
//
// Idempotency:
//   - Same castHash inserted twice → DB unique constraint, second is a no-op
//   - usedCastHashes on-chain is the ultimate replay defense

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/app/lib/db';
import { TIP_ALLOWLIST_FIDS, canTip } from '@/app/lib/constants/tipAccess';
import { isFidBanned, isAddressBanned } from '@/app/lib/constants/banList';
import { parseTipCast } from '@/app/lib/tipping/parseTipCast';

export const maxDuration = 30;

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
const NEYNAR_WEBHOOK_SECRET = process.env.NEYNAR_WEBHOOK_SECRET || '';

const MAX_CAST_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_TIP_WEI = 1_000n * 10n ** 18n;
const MAX_TIP_WEI = 10_000_000n * 10n ** 18n;

function castHashToBytes32(castHash: string): `0x${string}` | null {
  if (typeof castHash !== 'string' || !castHash.startsWith('0x')) return null;
  const raw = castHash.slice(2);
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length > 64) return null;
  return `0x${raw.padEnd(64, '0')}` as `0x${string}`;
}

function verifySignature(rawBody: string, headers: Headers): boolean {
  if (!NEYNAR_WEBHOOK_SECRET) {
    // Refuse if secret not configured — never accept unsigned in production
    return false;
  }
  // Neynar uses HMAC-SHA512 of the raw body, sent as hex
  // Header name varies by Neynar version: x-neynar-signature or x-webhook-signature
  const sigHex =
    headers.get('x-neynar-signature') ||
    headers.get('x-webhook-signature') ||
    '';
  if (!sigHex) return false;
  const computed = crypto
    .createHmac('sha512', NEYNAR_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(sigHex, 'hex')
    );
  } catch {
    return false;
  }
}

interface NeynarCastFromWebhook {
  hash?: string;
  text?: string;
  timestamp?: string;
  parent_hash?: string | null;
  parent_author?: { fid?: number };
  author?: {
    fid?: number;
    username?: string;
    verified_addresses?: {
      primary?: { eth_address?: string | null };
      eth_addresses?: string[];
    };
  };
}

async function fetchUserByFid(fid: number): Promise<{ wallet?: string; username?: string } | null> {
  if (!NEYNAR_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          accept: 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const u = (data?.users || [])[0];
    if (!u) return null;
    const wallet =
      u.verified_addresses?.primary?.eth_address ||
      u.verified_addresses?.eth_addresses?.[0];
    return { wallet, username: u.username };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1) Signature verification — fail closed if secret missing
  if (!verifySignature(rawBody, req.headers)) {
    return NextResponse.json({ ok: false, reason: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  // 2) Parse payload
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, reason: 'BAD_JSON' }, { status: 400 });
  }

  const payload = body as { type?: string; data?: NeynarCastFromWebhook };
  if (payload?.type !== 'cast.created' || !payload.data) {
    // Ignore other event types
    return NextResponse.json({ ok: true, skipped: 'not_cast_created' });
  }

  const cast = payload.data;
  if (!cast.hash || !cast.text || !cast.timestamp || !cast.author?.fid) {
    return NextResponse.json({ ok: true, skipped: 'incomplete_cast' });
  }

  const summary = {
    reason: '' as string,
    castHash: cast.hash,
  };

  // 3) Gates
  if (!cast.parent_hash) {
    summary.reason = 'NOT_A_REPLY';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const parsed = parseTipCast(cast.text);
  if (!parsed) {
    summary.reason = 'NO_TIP_PATTERN';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  if (parsed.amountWei < MIN_TIP_WEI || parsed.amountWei > MAX_TIP_WEI) {
    summary.reason = 'AMOUNT_OUT_OF_RANGE';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const ageMs = Date.now() - new Date(cast.timestamp).getTime();
  if (Number.isNaN(ageMs) || ageMs > MAX_CAST_AGE_MS) {
    summary.reason = 'CAST_TOO_OLD';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const fromFid = cast.author.fid;
  if (!canTip(fromFid)) {
    summary.reason = 'SENDER_NOT_IN_ALLOWLIST';
    return NextResponse.json({ ok: true, skipped: summary });
  }
  if (isFidBanned(fromFid)) {
    summary.reason = 'SENDER_BANNED';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const fromWallet =
    cast.author.verified_addresses?.primary?.eth_address ||
    cast.author.verified_addresses?.eth_addresses?.[0];
  if (!fromWallet) {
    summary.reason = 'SENDER_NO_WALLET';
    return NextResponse.json({ ok: true, skipped: summary });
  }
  if (isAddressBanned(fromWallet)) {
    summary.reason = 'SENDER_BANNED';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const toFid = cast.parent_author?.fid;
  if (!toFid || toFid <= 0) {
    summary.reason = 'RECIPIENT_FID_INVALID';
    return NextResponse.json({ ok: true, skipped: summary });
  }
  if (isFidBanned(toFid)) {
    summary.reason = 'RECIPIENT_BANNED';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const recipient = await fetchUserByFid(toFid);
  if (!recipient?.wallet) {
    summary.reason = 'RECIPIENT_NO_WALLET';
    return NextResponse.json({ ok: true, skipped: summary });
  }
  if (isAddressBanned(recipient.wallet)) {
    summary.reason = 'RECIPIENT_BANNED';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  if (fromWallet.toLowerCase() === recipient.wallet.toLowerCase()) {
    summary.reason = 'SELF_TIP';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  const padded = castHashToBytes32(cast.hash);
  if (!padded) {
    summary.reason = 'BAD_HASH';
    return NextResponse.json({ ok: true, skipped: summary });
  }

  // 4) Enqueue as pending. Idempotent: castHash is unique in DB.
  try {
    await prisma.tipCast.create({
      data: {
        castHash: padded,
        fromWallet: fromWallet.toLowerCase(),
        fromFid,
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
  } catch {
    // Already exists — webhook may have fired twice, or polling cron beat us. Fine.
    return NextResponse.json({ ok: true, enqueued: false, alreadyExists: true });
  }

  return NextResponse.json({
    ok: true,
    enqueued: true,
    castHash: padded,
    fromFid,
    toFid,
    amount: parsed.amountWhole.toString(),
  });
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    secretConfigured: !!NEYNAR_WEBHOOK_SECRET,
    allowlistFids: TIP_ALLOWLIST_FIDS.length,
  });
}
