#!/usr/bin/env node
// scripts/settle-tips-now.mjs
//
// Manually trigger the entire tip settlement pipeline (discover → worker → reconcile).
// Useful when you don't want to wait for the 2-minute cron cadence,
// or when investigating stuck tips.
//
// Usage:
//   node scripts/settle-tips-now.mjs
//   node scripts/settle-tips-now.mjs --base-url=https://pizza-party-game.vmfcoin.com
//   node scripts/settle-tips-now.mjs --base-url=http://localhost:3000
//
// Reads CRON_SECRET from .env (required).
// Reads ADMIN_API_KEY from .env (used for the admin endpoint instead, simpler).
//
// This calls the admin /api/admin/tip-settle-now route which does the orchestration.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Parse .env
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

// Parse args
const args = process.argv.slice(2);
const baseUrlArg = args.find((a) => a.startsWith('--base-url='));
const baseUrl = baseUrlArg ? baseUrlArg.split('=')[1] : 'https://pizza-party-game.vmfcoin.com';

const env = loadEnv();
const adminKey = env.ADMIN_API_KEY;
if (!adminKey) {
  console.error('ERROR: ADMIN_API_KEY not found in .env');
  process.exit(1);
}

console.log(`\n🍕  Manually settling all pending tips via ${baseUrl} ...\n`);
const t0 = Date.now();

try {
  const res = await fetch(`${baseUrl}/api/admin/tip-settle-now`, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
  });
  const data = await res.json();
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

  if (!res.ok) {
    console.error(`❌  HTTP ${res.status}:`, data);
    process.exit(1);
  }

  console.log(`✅  Settle pipeline complete in ${totalSec}s\n`);

  // Summarize each phase
  const phases = [
    ['DISCOVER', data.discover],
    ['WORKER', data.worker],
    ['RECONCILE', data.reconcile],
  ];
  if (data.workerRetry) phases.push(['WORKER (retry)', data.workerRetry]);

  for (const [name, phase] of phases) {
    if (!phase) continue;
    const dur = phase.durationMs ? `${(phase.durationMs / 1000).toFixed(1)}s` : '?';
    console.log(`── ${name} (${dur}) ──`);
    if (phase.error) {
      console.log(`  ERROR: ${phase.error}`);
      continue;
    }
    if (phase.summary) {
      console.log(`  ${JSON.stringify(phase.summary, null, 2).split('\n').join('\n  ')}`);
    }
    console.log('');
  }
} catch (e) {
  console.error('❌  Network error:', e.message);
  process.exit(1);
}
