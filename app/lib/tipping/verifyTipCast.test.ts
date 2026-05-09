// Manual gate-tests for verifyTipCast.
// These cover gates 1-10 (pure-function checks). Gate 11 (min stake) and gates
// 12-14 (vault state) require RPC calls and are tested separately via the
// foundry suite + a fork-mode script.
//
// Run: npx tsx app/lib/tipping/verifyTipCast.test.ts

import {
  verifyTipCast,
  type VerifyTipInput,
  MIN_TIP_AMOUNT_WEI,
  MAX_TIP_PER_CAST_WEI,
} from './verifyTipCast';

// We monkey-patch senderHasMinStake by re-mocking the module via dynamic import
// is overkill for this manual harness. Instead we test ONLY gates that don't
// require RPC, by passing valid sender data and accepting that the staking
// check at the end may either pass or fail based on the test wallet's state.
//
// To isolate gates 1-10 from gate 11, we pass a wallet we know is NOT staked
// and assert: the rejection reason is NOT one of the early gates' reasons,
// only `SENDER_NOT_STAKED` should remain after we pass all earlier gates.

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;
const FAKE_FROM = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const FAKE_TO = '0x2222222222222222222222222222222222222222' as `0x${string}`;

const ALLOWLISTED_FID = 1013491;       // in TIP_ALLOWLIST_FIDS
const NON_ALLOWLISTED_FID = 99999999;
const RECIPIENT_FID = 5650;

const NOW_ISO = () => new Date().toISOString();
// 25 hours ago — past the 24h age limit
const OLD_ISO = () => new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
// 5 minutes in the future — past the 60s clock skew tolerance
const FUTURE_ISO = () => new Date(Date.now() + 5 * 60 * 1000).toISOString();

function baseInput(overrides: Partial<VerifyTipInput> = {}): VerifyTipInput {
  return {
    cast: {
      hash: '0xabc',
      text: '1000 🍕',
      timestamp: NOW_ISO(),
      parent_hash: '0xparent',
      parent_fid: RECIPIENT_FID,
      author: { fid: ALLOWLISTED_FID },
    },
    fromWallet: FAKE_FROM,
    fromFid: ALLOWLISTED_FID,
    toWallet: FAKE_TO,
    toFid: RECIPIENT_FID,
    ...overrides,
  };
}

interface Case {
  name: string;
  input: VerifyTipInput;
  expectedReason: string | 'pass-early-gates';
}

const cases: Case[] = [
  // Gate 1
  {
    name: 'rejects non-reply (no parent_hash)',
    input: baseInput({ cast: { ...baseInput().cast, parent_hash: null } }),
    expectedReason: 'NOT_A_REPLY',
  },
  {
    name: 'rejects non-reply (parent_hash undefined)',
    input: baseInput({
      cast: {
        hash: '0xabc',
        text: '1000 🍕',
        timestamp: NOW_ISO(),
        author: { fid: ALLOWLISTED_FID },
      },
    }),
    expectedReason: 'NOT_A_REPLY',
  },

  // Gate 2
  {
    name: 'rejects no tip pattern',
    input: baseInput({ cast: { ...baseInput().cast, text: 'no tip here' } }),
    expectedReason: 'NO_TIP_PATTERN',
  },
  {
    name: 'rejects "🍕 1000" wrong order',
    input: baseInput({ cast: { ...baseInput().cast, text: '🍕 1000' } }),
    expectedReason: 'NO_TIP_PATTERN',
  },

  // Gate 2a (amount bounds)
  {
    name: 'rejects amount below min (999 < 1000)',
    input: baseInput({ cast: { ...baseInput().cast, text: '999 🍕' } }),
    expectedReason: 'AMOUNT_BELOW_MIN',
  },
  {
    name: 'rejects amount above max (10,000,001 > 10M)',
    input: baseInput({ cast: { ...baseInput().cast, text: '10000001 🍕' } }),
    expectedReason: 'AMOUNT_ABOVE_MAX',
  },

  // Gate 3
  {
    name: 'rejects cast > 10 min old',
    input: baseInput({ cast: { ...baseInput().cast, timestamp: OLD_ISO() } }),
    expectedReason: 'CAST_TOO_OLD',
  },
  {
    name: 'rejects future cast > 60s skew',
    input: baseInput({ cast: { ...baseInput().cast, timestamp: FUTURE_ISO() } }),
    expectedReason: 'CAST_TOO_OLD',
  },
  {
    name: 'rejects garbage timestamp',
    input: baseInput({ cast: { ...baseInput().cast, timestamp: 'not-a-date' } }),
    expectedReason: 'CAST_TOO_OLD',
  },

  // Gate 4 (allowlist)
  {
    name: 'rejects sender not in allowlist',
    input: baseInput({ fromFid: NON_ALLOWLISTED_FID }),
    expectedReason: 'SENDER_NOT_IN_ALLOWLIST',
  },
  {
    name: 'rejects sender FID = 0',
    input: baseInput({ fromFid: 0 }),
    expectedReason: 'SENDER_NOT_IN_ALLOWLIST',
  },

  // Gate 5
  {
    name: 'rejects sender wallet = 0x0',
    input: baseInput({ fromWallet: ZERO }),
    expectedReason: 'SENDER_HAS_NO_WALLET',
  },

  // Gate 7
  {
    name: 'rejects recipient FID = 0',
    input: baseInput({ toFid: 0 }),
    expectedReason: 'RECIPIENT_FID_INVALID',
  },
  {
    name: 'rejects recipient FID negative',
    input: baseInput({ toFid: -1 }),
    expectedReason: 'RECIPIENT_FID_INVALID',
  },

  // Gate 8
  {
    name: 'rejects recipient wallet = 0x0',
    input: baseInput({ toWallet: ZERO }),
    expectedReason: 'RECIPIENT_HAS_NO_WALLET',
  },

  // Gate 10
  {
    name: 'rejects self-tip (same wallet)',
    input: baseInput({ toWallet: FAKE_FROM }),
    expectedReason: 'SELF_TIP',
  },
  {
    name: 'rejects self-tip (case-insensitive)',
    input: baseInput({ toWallet: FAKE_FROM.toUpperCase() as `0x${string}` }),
    expectedReason: 'SELF_TIP',
  },

  // Gate 11 (this hits the staking RPC — fake wallets won't have stake)
  {
    name: 'rejects when sender not staked (fake wallet)',
    input: baseInput(),
    expectedReason: 'SENDER_NOT_STAKED',
  },
];

async function run() {
  let passed = 0;
  let failed = 0;
  const fails: string[] = [];

  for (const c of cases) {
    const r = await verifyTipCast(c.input);

    if (c.expectedReason === 'pass-early-gates') {
      if (r.ok) {
        passed++;
      } else {
        failed++;
        fails.push(`FAIL: ${c.name} — expected pass, got reason=${r.reason}`);
      }
      continue;
    }

    if (r.ok) {
      failed++;
      fails.push(`FAIL: ${c.name} — expected rejection ${c.expectedReason}, got ok=true`);
      continue;
    }
    if (r.reason !== c.expectedReason) {
      failed++;
      fails.push(`FAIL: ${c.name} — expected ${c.expectedReason}, got ${r.reason}`);
      continue;
    }
    passed++;
  }

  console.log(`\n=== verifyTipCast ===`);
  console.log(`PASSED: ${passed}/${cases.length}`);
  console.log(`MIN_TIP_AMOUNT_WEI: ${MIN_TIP_AMOUNT_WEI}`);
  console.log(`MAX_TIP_PER_CAST_WEI: ${MAX_TIP_PER_CAST_WEI}`);
  if (failed > 0) {
    console.log(`FAILED: ${failed}`);
    fails.forEach((f) => console.log(`  ${f}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
