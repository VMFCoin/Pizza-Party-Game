// Parses a Farcaster cast text to extract a tip amount.
//
// Spec (locked):
//   - Find the FIRST match of `\d+\s*(🍕|$pizza)` in the text (case-insensitive on $pizza)
//   - Multiple matches → use only the first
//   - No match → return null
//   - The amount is the integer captured group (no decimals — players type whole PIZZA)
//
// IMPORTANT: parsing is ONLY one of several gates a tip must pass.
// A tip is allowed only when ALL of the following are true:
//   1. Cast is a reply (checked by API layer, not here)
//   2. Cast text contains a valid tip pattern (checked here)
//   3. Sender has FID > 0 AND is in the allowlist (TIP_ALLOWLIST_FIDS)
//   4. Sender has staked ≥ $1 PIZZA (verified via staking contract `getStakeInfo`)
//   5. Recipient has FID > 0 (checked by API + on-chain)
//   6. Sender's vault tipBalance ≥ amount
//   7. Cast hash not previously used (DB + on-chain)
//   8. Cast age < 10 minutes
//   9. Sender wallet not on banList; recipient FID/wallet not on banList
//   10. from != to
//
// Examples that MATCH (first match used):
//   "1000 🍕"
//   "gm fam 1000 🍕"
//   "this deserves 5000 $Pizza fr"
//   "sending you 2500 $PIZZA for that take"
//   "gm 1000 🍕 and 2000 🍕"  → returns 1000n (first match only)
//
// Examples that DO NOT match:
//   "🍕 1000"          → wrong order
//   "1000 pizza"       → no $ symbol
//   "nothing here"     → no match
//   "1000$🍕"          → no whitespace between number and emoji (we require \s*)

// Match digits with optional comma/underscore thousands separators followed by a tip marker.
// Accepts: "1000 🍕", "1,000 🍕", "1_000 🍕", "173,096 $pizza", "1,234,567 $PIZZA".
// Strips separators after match. Always whole numbers (no decimals).
const TIP_REGEX = /(\d[\d,_]*)\s*(🍕|\$pizza)/i;

export interface ParsedTip {
  /** The amount in whole PIZZA (NOT wei). The contract layer converts to wei. */
  amountWhole: bigint;
  /** The amount in wei (18 decimals), ready for on-chain calls. */
  amountWei: bigint;
  /** Which token marker was matched ('🍕' or '$pizza' lowercase). */
  marker: '🍕' | '$pizza';
  /** The full matched substring (useful for logging). */
  matched: string;
}

/**
 * Parse a cast text and return the FIRST tip pattern, or null if none.
 * Uses the locked regex `/(\d+)\s*(🍕|$pizza)/i`.
 *
 * This is parsing ONLY. Auth, balance, FID, staking, and ban checks happen elsewhere.
 */
export function parseTipCast(text: string | null | undefined): ParsedTip | null {
  if (!text || typeof text !== 'string') return null;

  const match = TIP_REGEX.exec(text);
  if (!match) return null;

  const amountStrRaw = match[1];
  const markerRaw = match[2];

  // Strip thousand separators (commas, underscores) — regex permits them
  const amountStr = amountStrRaw.replace(/[,_]/g, '');

  // After stripping, must be pure digits and non-empty
  if (!amountStr || !/^\d+$/.test(amountStr)) return null;

  let amountWhole: bigint;
  try {
    amountWhole = BigInt(amountStr);
  } catch {
    return null;
  }

  if (amountWhole <= 0n) return null;

  const marker = markerRaw === '🍕' ? '🍕' : '$pizza';

  return {
    amountWhole,
    amountWei: amountWhole * 10n ** 18n,
    marker,
    matched: match[0],
  };
}
