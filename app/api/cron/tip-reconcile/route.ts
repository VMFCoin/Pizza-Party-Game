// GET /api/cron/tip-reconcile
//
// Phase 3 of 3-stage tipping architecture.
// Verifies on-chain that every "sent" or "processing" row's tx actually mined.
// If not, resets the row's status to "pending" so the worker retries.
//
// This catches:
//   - Worker timed out waiting for receipt → row stuck as "processing"
//   - Tx broadcast then dropped from mempool (nonce race, gas underpriced, etc.)
//
// Schedule: every 5 minutes.

import { NextRequest, NextResponse } from 'next/server';
import { type Hex } from 'viem';
import { prisma } from '@/app/lib/db';
import { tippingPublicClient } from '@/app/lib/tipping/tippingSigner';

export const maxDuration = 60;

const STALE_PROCESSING_AGE_MS = 60 * 1000;        // 60s without receipt = stale
const RECONCILE_BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-vercel-cron');
  const cronSecret = process.env.CRON_SECRET;
  if (cronHeader !== '1' && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = {
    sentVerified: 0,        // rows already marked sent — confirmed on chain
    sentLost: 0,            // rows marked sent but tx not on chain → reset to pending
    processingConfirmed: 0, // rows in processing now confirmed on chain
    processingLost: 0,      // rows in processing but tx not on chain → reset to pending
    skippedYoung: 0,        // processing rows too young to reconcile yet
    errors: [] as string[],
  };

  // 1. Re-verify "sent" rows. If the tx hash doesn't exist on chain, reset them.
  const sentRows = await prisma.tipCast.findMany({
    where: { status: 'sent', txHash: { not: null } },
    orderBy: { updatedAt: 'asc' },
    take: RECONCILE_BATCH_SIZE,
  });

  for (const row of sentRows) {
    if (!row.txHash) continue;
    try {
      const receipt = await tippingPublicClient.getTransactionReceipt({
        hash: row.txHash as Hex,
      });
      if (receipt && receipt.status === 'success') {
        summary.sentVerified++;
      } else {
        // Reverted or strange — reset for retry, but only if cast still under
        // 24h to avoid permanent retry loops on bad casts
        const ageMs = Date.now() - row.castTimestamp.getTime();
        if (ageMs < 24 * 60 * 60 * 1000) {
          await prisma.tipCast.update({
            where: { id: row.id },
            data: { status: 'pending', txHash: null, errorReason: 'reverted, retrying' },
          });
        } else {
          await prisma.tipCast.update({
            where: { id: row.id },
            data: { status: 'failed', errorReason: 'reverted and cast too old to retry' },
          });
        }
        summary.sentLost++;
      }
    } catch {
      // Receipt not found → tx was dropped. Reset to pending if under 24h.
      const ageMs = Date.now() - row.castTimestamp.getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        await prisma.tipCast.update({
          where: { id: row.id },
          data: { status: 'pending', txHash: null, errorReason: 'tx dropped, retrying' },
        });
        summary.sentLost++;
      } else {
        await prisma.tipCast.update({
          where: { id: row.id },
          data: { status: 'failed', errorReason: 'tx dropped, cast too old' },
        });
        summary.sentLost++;
      }
    }
  }

  // 2. Resolve "processing" rows that are stuck (worker died/timed out).
  const processingRows = await prisma.tipCast.findMany({
    where: { status: 'processing' },
    orderBy: { updatedAt: 'asc' },
    take: RECONCILE_BATCH_SIZE,
  });

  for (const row of processingRows) {
    const stalenessMs = Date.now() - row.updatedAt.getTime();
    if (stalenessMs < STALE_PROCESSING_AGE_MS) {
      // Still fresh, worker may still be waiting for receipt
      summary.skippedYoung++;
      continue;
    }

    if (row.txHash) {
      try {
        const receipt = await tippingPublicClient.getTransactionReceipt({
          hash: row.txHash as Hex,
        });
        if (receipt && receipt.status === 'success') {
          await prisma.tipCast.update({
            where: { id: row.id },
            data: { status: 'sent' },
          });
          summary.processingConfirmed++;
          continue;
        }
        // Reverted — reset
        await prisma.tipCast.update({
          where: { id: row.id },
          data: { status: 'pending', txHash: null, errorReason: 'processing reverted, retrying' },
        });
        summary.processingLost++;
      } catch {
        // No receipt → tx dropped or never landed → reset
        await prisma.tipCast.update({
          where: { id: row.id },
          data: { status: 'pending', txHash: null, errorReason: 'processing tx not on chain, retrying' },
        });
        summary.processingLost++;
      }
    } else {
      // processing without a tx hash means worker died before broadcast
      await prisma.tipCast.update({
        where: { id: row.id },
        data: { status: 'pending', errorReason: 'processing without tx, retrying' },
      });
      summary.processingLost++;
    }
  }

  return NextResponse.json({ ok: true, summary });
}
