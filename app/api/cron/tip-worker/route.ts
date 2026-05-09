// GET /api/cron/tip-worker
//
// Phase 2 of 3-stage tipping architecture.
// Drains the `pending` queue from tip_casts and submits each to the chain.
// Manages nonces locally per run to prevent same-nonce collisions.
// CRITICAL: only marks `sent` AFTER waitForTransactionReceipt confirms.
//
// Schedule: every 1 minute. Processes up to MAX_PER_RUN tips per call;
// remainder picked up next run.
//
// Atomic per-row state machine:
//   pending → processing (claim row)
//   processing → sent  (after on-chain confirmation)
//   processing → failed (on revert or timeout)

import { NextRequest, NextResponse } from 'next/server';
import { type Address, type Hex } from 'viem';
import { prisma } from '@/app/lib/db';
import {
  PIZZA_TIPPING_VAULT_ADDRESS,
  PIZZA_TIPPING_VAULT_ABI,
} from '@/app/lib/constants';
import { senderHasMinStake } from '@/app/lib/tipping/verifyTipCast';
import { getTippingWalletClient, tippingPublicClient } from '@/app/lib/tipping/tippingSigner';

export const maxDuration = 60;

const MAX_PER_RUN = 25;             // bounded so we always finish within maxDuration
const RECEIPT_TIMEOUT_MS = 30_000;  // wait at most 30s per tx for receipt

interface TipCastRow {
  id: string;
  castHash: string;
  fromWallet: string;
  fromFid: number;
  toWallet: string;
  toFid: number;
  amount: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const cronSecret = process.env.CRON_SECRET;
  if (cronHeader !== '1' && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (PIZZA_TIPPING_VAULT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return NextResponse.json({ error: 'Vault not deployed' }, { status: 500 });
  }
  const vault = PIZZA_TIPPING_VAULT_ADDRESS as Address;

  // Pull pending rows oldest-first
  const pending = await prisma.tipCast.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_RUN,
  });

  const summary = {
    found: pending.length,
    sent: 0,
    failed: 0,
    skippedStaleSender: 0,
    skippedInsufficientBalance: 0,
    errors: [] as string[],
  };

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, summary });
  }

  // Initialize signer + nonce ONCE per run
  let walletClient;
  try {
    walletClient = getTippingWalletClient().walletClient;
  } catch (e) {
    return NextResponse.json(
      { error: `Backend signer setup failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 }
    );
  }

  let nonce: number;
  try {
    nonce = await tippingPublicClient.getTransactionCount({
      address: walletClient.account.address,
      blockTag: 'pending',
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to fetch nonce: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 }
    );
  }

  // Process each row sequentially (same signer = serial nonces)
  for (const row of pending as TipCastRow[]) {
    const fromWallet = row.fromWallet as Address;
    const toWallet = row.toWallet as Address;
    const amountWei = BigInt(row.amount);
    const castHash = row.castHash as `0x${string}`;

    // Re-verify: sender must STILL have ≥ $1 staked (state could have changed since discover)
    let hasStake: boolean;
    try {
      hasStake = await senderHasMinStake(fromWallet);
    } catch {
      hasStake = false;
    }
    if (!hasStake) {
      await prisma.tipCast.update({
        where: { id: row.id },
        data: { status: 'failed', errorReason: 'sender no longer has min stake' },
      });
      summary.skippedStaleSender++;
      continue;
    }

    // Re-verify: sender's tip balance covers it
    let balance: bigint;
    try {
      balance = (await tippingPublicClient.readContract({
        address: vault,
        abi: PIZZA_TIPPING_VAULT_ABI,
        functionName: 'tipBalance',
        args: [fromWallet],
      })) as bigint;
    } catch {
      balance = 0n;
    }
    if (balance < amountWei) {
      await prisma.tipCast.update({
        where: { id: row.id },
        data: { status: 'failed', errorReason: 'insufficient tip balance' },
      });
      summary.skippedInsufficientBalance++;
      continue;
    }

    // Claim the row (status: processing) — best-effort, races are fine because
    // the chain is the ultimate source of truth via usedCastHashes
    try {
      await prisma.tipCast.update({
        where: { id: row.id, status: 'pending' },
        data: { status: 'processing' },
      });
    } catch {
      // Another worker took it. Skip.
      continue;
    }

    // Build + broadcast tx with explicit nonce
    let txHash: Hex;
    try {
      txHash = await walletClient.writeContract({
        address: vault,
        abi: PIZZA_TIPPING_VAULT_ABI,
        functionName: 'spendTip',
        args: [fromWallet, toWallet, BigInt(row.toFid), amountWei, castHash],
        gas: 250_000n,
        nonce: nonce++, // increment locally
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      console.error('[tip-worker] writeContract:', msg);
      await prisma.tipCast.update({
        where: { id: row.id },
        data: { status: 'failed', errorReason: msg.slice(0, 500) },
      });
      summary.failed++;
      // If we got a "nonce too low" error, sync from chain again
      if (/nonce/i.test(msg)) {
        try {
          nonce = await tippingPublicClient.getTransactionCount({
            address: walletClient.account.address,
            blockTag: 'pending',
          });
        } catch {}
      }
      continue;
    }

    // Save tx hash optimistically (status still 'processing')
    await prisma.tipCast.update({
      where: { id: row.id },
      data: { txHash },
    });

    // Wait for receipt — only mark `sent` if it actually mines
    try {
      const receipt = await tippingPublicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: RECEIPT_TIMEOUT_MS,
        confirmations: 1,
      });
      if (receipt.status === 'success') {
        await prisma.tipCast.update({
          where: { id: row.id },
          data: { status: 'sent' },
        });
        summary.sent++;
      } else {
        await prisma.tipCast.update({
          where: { id: row.id },
          data: { status: 'failed', errorReason: 'tx reverted on chain' },
        });
        summary.failed++;
      }
    } catch (e) {
      // Timeout or RPC error — leave status as 'processing'.
      // Reconciler will check txHash on chain and either mark sent or reset to pending.
      const msg = e instanceof Error ? e.message : 'unknown';
      console.warn('[tip-worker] waitForReceipt:', msg);
      summary.errors.push(`row ${row.id} receipt: ${msg.slice(0, 100)}`);
    }
  }

  return NextResponse.json({ ok: true, summary });
}
