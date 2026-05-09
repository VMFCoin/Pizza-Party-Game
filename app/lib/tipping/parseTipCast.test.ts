// Manual parser test cases — no test framework required.
//
// Run by hand: npx tsx app/lib/tipping/parseTipCast.test.ts
// (or just read this file as the spec for what parseTipCast must do)

import { parseTipCast } from './parseTipCast';

interface Case {
  name: string;
  input: string | null;
  expectMatch: boolean;
  expectedWhole?: bigint;
  expectedMarker?: '🍕' | '$pizza';
}

const cases: Case[] = [
  // Match cases
  { name: '"1000 🍕"', input: '1000 🍕', expectMatch: true, expectedWhole: 1000n, expectedMarker: '🍕' },
  { name: '"1000 $pizza" lowercase', input: '1000 $pizza', expectMatch: true, expectedWhole: 1000n, expectedMarker: '$pizza' },
  { name: '"1000 $Pizza" mixed case', input: '1000 $Pizza', expectMatch: true, expectedWhole: 1000n },
  { name: '"1000 $PIZZA" all caps', input: '1000 $PIZZA', expectMatch: true, expectedWhole: 1000n },
  { name: '"gm fam 1000 🍕"', input: 'gm fam 1000 🍕', expectMatch: true, expectedWhole: 1000n },
  { name: '"this deserves 5000 🍕 fr"', input: 'this deserves 5000 🍕 fr', expectMatch: true, expectedWhole: 5000n },
  { name: '"sending love 2500 $Pizza"', input: 'sending love 2500 $Pizza', expectMatch: true, expectedWhole: 2500n },
  { name: '"1000🍕" no whitespace', input: '1000🍕', expectMatch: true, expectedWhole: 1000n },

  // First-match-only behavior
  { name: 'two emoji tips → first wins', input: 'gm 1000 🍕 and 2000 🍕', expectMatch: true, expectedWhole: 1000n },
  { name: 'emoji + $pizza mixed', input: '1000 🍕 also 5000 $Pizza', expectMatch: true, expectedWhole: 1000n },
  { name: '$pizza first', input: '5000 $pizza is great. and 1000 🍕', expectMatch: true, expectedWhole: 5000n },

  // Reject cases
  { name: 'empty string', input: '', expectMatch: false },
  { name: 'null', input: null, expectMatch: false },
  { name: '"🍕 1000" wrong order', input: '🍕 1000', expectMatch: false },
  { name: '"1000 pizza" no $', input: '1000 pizza', expectMatch: false },
  { name: '"1000 $piza" typo', input: '1000 $piza', expectMatch: false },
  { name: 'plain text no amount', input: 'nothing here', expectMatch: false },
  { name: '"0 🍕" zero amount', input: '0 🍕', expectMatch: false },

  // Edge cases
  { name: 'newlines around tip', input: 'gm\n1000 🍕\nthanks', expectMatch: true, expectedWhole: 1000n },
  { name: 'unicode noise', input: '🔥🔥 1000 🍕 🔥🔥', expectMatch: true, expectedWhole: 1000n },

  // Thousand separators (humans naturally type these)
  { name: '"1,000 🍕" comma', input: '1,000 🍕', expectMatch: true, expectedWhole: 1000n },
  { name: '"1,234,567 🍕" multi-comma', input: '1,234,567 🍕', expectMatch: true, expectedWhole: 1234567n },
  { name: '"173,096 $pizza" comma + $pizza', input: '173,096 $pizza', expectMatch: true, expectedWhole: 173096n },
  { name: '"1_000 🍕" underscore', input: '1_000 🍕', expectMatch: true, expectedWhole: 1000n },
  { name: '"100_000 $PIZZA" underscore + caps', input: '100_000 $PIZZA', expectMatch: true, expectedWhole: 100000n },
  { name: 'sentence with comma amount', input: 'sending 173,096 🍕 to you', expectMatch: true, expectedWhole: 173096n },

  // Garbage shouldn't crash but also shouldn't match
  { name: '",500 🍕" leading comma', input: ',500 🍕', expectMatch: true, expectedWhole: 500n }, // regex anchors on \d
];

function run() {
  let passed = 0;
  let failed = 0;
  const fails: string[] = [];

  for (const c of cases) {
    const r = parseTipCast(c.input as string);
    const matched = r != null;

    if (matched !== c.expectMatch) {
      failed++;
      fails.push(`FAIL: ${c.name} — expected match=${c.expectMatch}, got match=${matched}`);
      continue;
    }
    if (c.expectMatch && c.expectedWhole != null) {
      if (r!.amountWhole !== c.expectedWhole) {
        failed++;
        fails.push(`FAIL: ${c.name} — expected ${c.expectedWhole}, got ${r!.amountWhole}`);
        continue;
      }
    }
    if (c.expectMatch && c.expectedMarker != null) {
      if (r!.marker !== c.expectedMarker) {
        failed++;
        fails.push(`FAIL: ${c.name} — expected marker ${c.expectedMarker}, got ${r!.marker}`);
        continue;
      }
    }
    passed++;
  }

  console.log(`\n=== parseTipCast ===`);
  console.log(`PASSED: ${passed}/${cases.length}`);
  if (failed > 0) {
    console.log(`FAILED: ${failed}`);
    fails.forEach((f) => console.log(`  ${f}`));
    process.exit(1);
  }
}

// Auto-run when executed directly
if (require.main === module) {
  run();
}

export { run, cases };
