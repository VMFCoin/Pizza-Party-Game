// POST /api/tip/execute
//
// Triggered by the Neynar webhook (or cron poll) when a reply cast contains
// a tip pattern. Runs the full verification chain, then has the dedicated
// tipping backend signer call vault.spendTip().
//
// Request body:
//   {
//     cast: NeynarCast (hash, text, timestamp, parent_hash, parent_fid, author),
//     fromWallet, fromFid, fromUsername?,
//     toWallet, toFid, toUsername?
//   }
//
// Response:
//   200 { ok: true, txHash, amount, ... }      → tip executed
//   200 { ok: false, reason: 'NOT_A_REPLY' }   → rejected by gate (do not retry)
//   500 { error: 'Backend signer not configured' } → infra issue (retry later)

import { NextRequest, NextResponse } from 'next/server';
import type { Address, Hex } from 'viem';
import { prisma } from '@/app/lib/db';
import {
  PIZZA_TIPPING_VAULT_ADDRESS,
  PIZZA_TIPPING_VAULT_ABI,
} from '@/app/lib/constants';
import {
  verifyTipCast,
  isCastHashUsedOnChain,
  senderTipBalanceAtLeast,
  type TipVerificationResult,
} from '@/app/lib/tipping/verifyTipCast';
import { getTippingWalletClient, tippingPublicClient } from '@/app/lib/tipping/tippingSigner';

export const maxDuration = 30;

// ============================================================
// Helpers
// ============================================================

function jsonRejected(reason: string, detail?: string) {
  return NextResponse.json({ ok: false, reason, detail }, { status: 200 });
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function castHashToBytes32(castHash: string): `0x${string}` | null {
  // Farcaster cast hashes are 20-byte hex (0x + 40 chars).
  // We pad to 32 bytes (bytes32) for on-chain storage.
  if (typeof castHash !== 'string' || !castHash.startsWith('0x')) return null;
  const raw = castHash.slice(2);
  if (!/^[0-9a-f]+$/i.test(raw)) return null;
  if (raw.length > 64) return null;
  // Right-pad with zeros to 64 hex chars (32 bytes)
  const padded = raw.padEnd(64, '0');
  return `0x${padded}` as `0x${string}`;
}

// ============================================================
// Route
// ============================================================

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  // Type-guard the input
  const input = body as {
    cast?: {
      hash?: string;
      text?: string;
      timestamp?: string;
      parent_hash?: string | null;
      parent_fid?: number | null;
      author?: { fid?: number; username?: string };
    };
    fromWallet?: string;
    fromFid?: number;
    fromUsername?: string;
    toWallet?: string;
    toFid?: number;
    toUsername?: string;
  };

  // Required fields
  if (
    !input?.cast?.hash ||
    !input.cast?.text ||
    !input.cast?.timestamp ||
    !input.cast?.author?.fid ||
    !input.fromWallet ||
    !input.fromFid ||
    !input.toWallet ||
    !input.toFid
  ) {
    return jsonError('Missing required fields', 400);
  }

  const castHashBytes32 = castHashToBytes32(input.cast.hash);
  if (!castHashBytes32) {
    return jsonError('Invalid cast hash format', 400);
  }

  // ============================================================
  // Pre-flight DB dedup (cheap before any RPC)
  // ============================================================
  const existing = await prisma.tipCast.findUnique({
    where: { castHash: castHashBytes32 },
  });
  if (existing) {
    return jsonRejected('CAST_ALREADY_USED', `db_status=${existing.status}`);
  }

  // ============================================================
  // Gates 1-11: pure / staking-balance verification
  // ============================================================
  let verification: TipVerificationResult;
  try {
    verification = await verifyTipCast({
      cast: {
        hash: input.cast.hash,
        text: input.cast.text,
        timestamp: input.cast.timestamp,
        parent_hash: input.cast.parent_hash,
        parent_fid: input.cast.parent_fid,
        author: { fid: input.cast.author.fid, username: input.cast.author.username },
      },
      fromWallet: input.fromWallet as Address,
      fromFid: input.fromFid,
      fromUsername: input.fromUsername,
      toWallet: input.toWallet as Address,
      toFid: input.toFid,
      toUsername: input.toUsername,
    });
  } catch (err) {
    console.error('[tip/execute] verifyTipCast threw:', err);
    return jsonError('Verification error', 500);
  }

  if (!verification.ok) {
    // Persist the rejection for audit/debug
    try {
      await prisma.tipCast.create({
        data: {
          castHash: castHashBytes32,
          fromWallet: input.fromWallet.toLowerCase(),
          fromFid: input.fromFid,
          fromUsername: input.fromUsername,
          toWallet: input.toWallet.toLowerCase(),
          toFid: input.toFid,
          toUsername: input.toUsername,
          amount: '0',
          status: 'rejected',
          errorReason: verification.reason,
          castTimestamp: new Date(input.cast.timestamp),
          parentCastHash: input.cast.parent_hash ?? null,
        },
      });
    } catch (e) {
      // Race: someone else just inserted same castHash. Fine.
      console.warn('[tip/execute] dedup race on rejection insert:', e);
    }
    return jsonRejected(verification.reason, verification.detail);
  }

  // ============================================================
  // Vault wired check
  // ============================================================
  if (
    PIZZA_TIPPING_VAULT_ADDRESS === '0x0000000000000000000000000000000000000000' ||
    !PIZZA_TIPPING_VAULT_ADDRESS
  ) {
    // Vault not deployed yet — silently no-op for FID-allowlisted users
    return jsonRejected('VAULT_NOT_DEPLOYED');
  }
  const vault = PIZZA_TIPPING_VAULT_ADDRESS as Address;

  // ============================================================
  // Gate 13: cast not used on-chain (defense-in-depth on top of DB)
  // ============================================================
  const usedOnChain = await isCastHashUsedOnChain(vault, castHashBytes32);
  if (usedOnChain) {
    return jsonRejected('CAST_ALREADY_USED', 'on_chain');
  }

  // ============================================================
  // Gate 14: sender has enough tipBalance
  // ============================================================
  const enough = await senderTipBalanceAtLeast(
    vault,
    verification.fromWallet,
    verification.parsed.amountWei
  );
  if (!enough) {
    return jsonRejected('INSUFFICIENT_TIP_BALANCE');
  }

  // ============================================================
  // Persist as pending (claims the castHash so duplicates 409 in DB)
  // ============================================================
  let pendingId: string;
  try {
    const created = await prisma.tipCast.create({
      data: {
        castHash: castHashBytes32,
        fromWallet: verification.fromWallet.toLowerCase(),
        fromFid: verification.fromFid,
        fromUsername: verification.fromUsername,
        toWallet: verification.toWallet.toLowerCase(),
        toFid: verification.toFid,
        toUsername: verification.toUsername,
        amount: verification.parsed.amountWei.toString(),
        status: 'pending',
        castTimestamp: verification.castTimestamp,
        parentCastHash: input.cast.parent_hash ?? null,
      },
    });
    pendingId = created.id;
  } catch {
    // Unique violation on castHash → racing duplicate
    return jsonRejected('CAST_ALREADY_USED', 'db_race');
  }

  // ============================================================
  // Execute on-chain via backend signer
  // ============================================================
  let txHash: Hex;
  try {
    const { walletClient } = getTippingWalletClient();

    // Simulate first to surface contract reverts in our logs (not strictly
    // needed — writeContract will still revert if simulate would fail).
    await tippingPublicClient.simulateContract({
      address: vault,
      abi: PIZZA_TIPPING_VAULT_ABI,
      functionName: 'spendTip',
      args: [
        verification.fromWallet,
        verification.toWallet,
        BigInt(verification.toFid),
        verification.parsed.amountWei,
        castHashBytes32,
      ],
      account: walletClient.account,
    });

    // Fetch nonce from PENDING (not latest) so back-to-back txs from the
    // same signer don't collide on the same nonce. Default viem behavior
    // uses latest, which causes nonce-race when multiple tips fire close
    // together (e.g., the cron processing 2 casts in the same run).
    const pendingNonce = await tippingPublicClient.getTransactionCount({
      address: walletClient.account.address,
      blockTag: 'pending',
    });

    txHash = await walletClient.writeContract({
      address: vault,
      abi: PIZZA_TIPPING_VAULT_ABI,
      functionName: 'spendTip',
      args: [
        verification.fromWallet,
        verification.toWallet,
        BigInt(verification.toFid),
        verification.parsed.amountWei,
        castHashBytes32,
      ],
      gas: 250_000n,
      nonce: pendingNonce,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[tip/execute] writeContract failed:', msg);
    await prisma.tipCast.update({
      where: { id: pendingId },
      data: { status: 'failed', errorReason: msg.slice(0, 500) },
    });
    return jsonRejected('CHAIN_ERROR', msg.slice(0, 200));
  }

  // ============================================================
  // Mark sent
  // ============================================================
  await prisma.tipCast.update({
    where: { id: pendingId },
    data: { status: 'sent', txHash },
  });

  return NextResponse.json({
    ok: true,
    txHash,
    amount: verification.parsed.amountWhole.toString(),
    castHash: castHashBytes32,
    from: verification.fromWallet,
    to: verification.toWallet,
    recipientFid: verification.toFid,
  });
}
