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
import { type Address, type Hex } from 'viem';
import { prisma } from '@/app/lib/db';
import { TIP_ALLOWLIST_FIDS, canTip } from '@/app/lib/constants/tipAccess';
import { isFidBanned, isAddressBanned } from '@/app/lib/constants/banList';
import { parseTipCast } from '@/app/lib/tipping/parseTipCast';
import {
  PIZZA_TIPPING_VAULT_ADDRESS,
  PIZZA_TIPPING_VAULT_ABI,
} from '@/app/lib/constants';
import { senderHasMinStake } from '@/app/lib/tipping/verifyTipCast';
import { getTippingWalletClient, tippingPublicClient } from '@/app/lib/tipping/tippingSigner';

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

  // 4) Insert DB row in 'processing' state to claim this cast. Idempotent on castHash.
  let rowId: string;
  try {
    const created = await prisma.tipCast.create({
      data: {
        castHash: padded,
        fromWallet: fromWallet.toLowerCase(),
        fromFid,
        fromUsername: cast.author.username,
        toWallet: recipient.wallet.toLowerCase(),
        toFid,
        toUsername: recipient.username,
        amount: parsed.amountWei.toString(),
        status: 'processing',
        castTimestamp: new Date(cast.timestamp),
        parentCastHash: cast.parent_hash ?? null,
      },
    });
    rowId = created.id;
  } catch {
    // Already exists — webhook may have fired twice. Reconciler/worker will handle if it's stuck.
    return NextResponse.json({ ok: true, enqueued: false, alreadyExists: true });
  }

  // 5) Execute on-chain INLINE. Webhook → tx in seconds, no cron wait.
  // If anything fails here we leave the row state so the worker/reconciler can finish it.
  if (
    PIZZA_TIPPING_VAULT_ADDRESS === '0x0000000000000000000000000000000000000000' ||
    !PIZZA_TIPPING_VAULT_ADDRESS
  ) {
    return NextResponse.json({ ok: true, enqueued: true, executed: false, reason: 'VAULT_NOT_DEPLOYED' });
  }
  const vault = PIZZA_TIPPING_VAULT_ADDRESS as Address;

  // Re-verify sender still has min stake (defense in depth — state could change between webhook trigger and execute)
  let hasStake = false;
  try {
    hasStake = await senderHasMinStake(fromWallet as Address);
  } catch {}
  if (!hasStake) {
    await prisma.tipCast.update({
      where: { id: rowId },
      data: { status: 'failed', errorReason: 'sender no longer has min stake' },
    });
    return NextResponse.json({ ok: true, enqueued: true, executed: false, reason: 'SENDER_NOT_STAKED' });
  }

  // Verify sender has tip balance for this amount
  let balance: bigint = 0n;
  try {
    balance = (await tippingPublicClient.readContract({
      address: vault,
      abi: PIZZA_TIPPING_VAULT_ABI,
      functionName: 'tipBalance',
      args: [fromWallet as Address],
    })) as bigint;
  } catch {}
  if (balance < parsed.amountWei) {
    await prisma.tipCast.update({
      where: { id: rowId },
      data: { status: 'failed', errorReason: 'insufficient tip balance' },
    });
    return NextResponse.json({ ok: true, enqueued: true, executed: false, reason: 'INSUFFICIENT_BALANCE' });
  }

  // Sign + broadcast spendTip. Fetch pending nonce explicitly to handle bursts.
  let txHash: Hex;
  try {
    const { walletClient } = getTippingWalletClient();
    const nonce = await tippingPublicClient.getTransactionCount({
      address: walletClient.account.address,
      blockTag: 'pending',
    });
    txHash = await walletClient.writeContract({
      address: vault,
      abi: PIZZA_TIPPING_VAULT_ABI,
      functionName: 'spendTip',
      args: [
        fromWallet as Address,
        recipient.wallet as Address,
        BigInt(toFid),
        parsed.amountWei,
        padded,
      ],
      gas: 250_000n,
      nonce,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[tip/webhook] writeContract failed:', msg);
    await prisma.tipCast.update({
      where: { id: rowId },
      data: { status: 'failed', errorReason: msg.slice(0, 500) },
    });
    return NextResponse.json({ ok: true, enqueued: true, executed: false, reason: 'CHAIN_ERROR', error: msg.slice(0, 200) });
  }

  // Save tx hash optimistically; reconciler/worker will verify if we crash here
  await prisma.tipCast.update({
    where: { id: rowId },
    data: { txHash },
  });

  // Wait for receipt (with a generous timeout but not so long the webhook 10s budget blows)
  try {
    const receipt = await tippingPublicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 20_000,
      confirmations: 1,
    });
    if (receipt.status === 'success') {
      await prisma.tipCast.update({
        where: { id: rowId },
        data: { status: 'sent' },
      });
      return NextResponse.json({
        ok: true,
        executed: true,
        txHash,
        castHash: padded,
        fromFid,
        toFid,
        amount: parsed.amountWhole.toString(),
      });
    } else {
      await prisma.tipCast.update({
        where: { id: rowId },
        data: { status: 'failed', errorReason: 'tx reverted on chain' },
      });
      return NextResponse.json({ ok: true, executed: false, reason: 'TX_REVERTED', txHash });
    }
  } catch {
    // Timed out waiting for receipt — leave as 'processing'.
    // The reconciler cron will check this tx hash and either mark sent or reset to pending.
    return NextResponse.json({
      ok: true,
      executed: 'pending_confirmation',
      txHash,
      castHash: padded,
      fromFid,
      toFid,
      amount: parsed.amountWhole.toString(),
    });
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    secretConfigured: !!NEYNAR_WEBHOOK_SECRET,
    allowlistFids: TIP_ALLOWLIST_FIDS.length,
  });
}
