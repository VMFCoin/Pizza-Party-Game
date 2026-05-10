// POST /api/admin/tip-settle-now
//
// Manual trigger to force-settle all pending tips immediately.
// Runs the full pipeline (discover → worker → reconcile) end-to-end.
// Useful when you don't want to wait the 2-minute cron cadence,
// or when investigating stuck tips.
//
// Auth: x-admin-key header (matches ADMIN_API_KEY env var).
// Also supports a GET endpoint for easier curl testing.
//
// curl examples:
//   curl -X POST -H "x-admin-key: $ADMIN_API_KEY" \
//     https://pizza-party-game.vmfcoin.com/api/admin/tip-settle-now
//
//   curl -H "x-admin-key: $ADMIN_API_KEY" \
//     https://pizza-party-game.vmfcoin.com/api/admin/tip-settle-now

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120; // up to 2 minutes (each cron is up to 60s)

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

async function callCron(req: NextRequest, path: string) {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const url = `${proto}://${host}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, durationMs: Date.now() - t0, ...json };
  } catch (e) {
    return {
      ok: false,
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : 'unknown',
    };
  }
}

async function handle(request: NextRequest) {
  const apiKey = request.headers.get('x-admin-key');
  if (!ADMIN_API_KEY || apiKey !== ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  // Run all 3 phases sequentially. Each one is internally idempotent;
  // running discover first ensures any new tip casts since the last cron get queued.
  const discover = await callCron(request, '/api/cron/tip-discover');
  const worker = await callCron(request, '/api/cron/tip-worker');
  const reconcile = await callCron(request, '/api/cron/tip-reconcile');

  // If reconciler reset any rows back to pending, run worker once more to drain them.
  let workerRetry: Awaited<ReturnType<typeof callCron>> | null = null;
  const reconcileSummary = reconcile?.summary as
    | { sentLost?: number; processingLost?: number }
    | undefined;
  if (
    reconcileSummary &&
    ((reconcileSummary.sentLost ?? 0) > 0 || (reconcileSummary.processingLost ?? 0) > 0)
  ) {
    workerRetry = await callCron(request, '/api/cron/tip-worker');
  }

  return NextResponse.json({
    ok: true,
    totalDurationMs: Date.now() - startedAt,
    discover,
    worker,
    reconcile,
    workerRetry,
  });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// Also support GET for easy curl testing
export async function GET(request: NextRequest) {
  return handle(request);
}
