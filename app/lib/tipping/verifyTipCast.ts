// Multi-layer pre-flight verification for a tip cast.
//
// This runs in the API layer BEFORE invoking the backend signer.
// If ANY gate fails, the tip is rejected and never hits the contract.
//
// Gates (in order):
//   1. Cast is a reply (not a root cast)
//   2. Cast text contains a valid tip pattern
//   3. Cast is < 10 minutes old
//   4. Sender FID is on the tipping allowlist (until public launch)
//   5. Sender resolves to a wallet via Neynar
//   6. Sender wallet not on banList; sender FID not on banList
//   7. Recipient FID > 0
//   8. Recipient resolves to a wallet via Neynar
//   9. Recipient wallet not on banList; recipient FID not on banList
//   10. from != to (no self-tipping)
//   11. Sender has staked ≥ $1 PIZZA on the staking contract
//   12. Cast hash not in Postgres (fast dedup)
//   13. Cast hash not in vault.usedCastHashes() (on-chain confirm)
//   14. Sender has tipBalance ≥ amount

import { createPublicClient, http, fallback, type Address } from 'viem';
import { base } from 'viem/chains';
import {
  PIZZA_STAKING_ADDRESS,
  PIZZA_STAKING_ABI,
} from '@/app/lib/constants';
import { canTip } from '@/app/lib/constants/tipAccess';
import { isFidBanned, isAddressBanned } from '@/app/lib/constants/banList';
import { parseTipCast, type ParsedTip } from './parseTipCast';

// ============================================================
// Contract limits (must match PizzaTippingVaultUpgradeable initializer)
// ============================================================
export const MIN_TIP_AMOUNT_WEI = 1_000n * 10n ** 18n;        // 1,000 PIZZA
export const MAX_TIP_PER_CAST_WEI = 10_000_000n * 10n ** 18n; // 10M PIZZA
export const MAX_CREDIT_PER_TX_WEI = 100_000_000n * 10n ** 18n; // 100M PIZZA

// ============================================================
// Public client (fallback RPCs to avoid 429 rate limits)
// ============================================================
const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', { timeout: 15_000 }),
    http('https://base-rpc.publicnode.com', { timeout: 15_000 }),
    http('https://base.meowrpc.com', { timeout: 15_000 }),
  ]),
});

// ============================================================
// Types
// ============================================================
export type TipReject =
  | 'NOT_A_REPLY'
  | 'NO_TIP_PATTERN'
  | 'CAST_TOO_OLD'
  | 'SENDER_NOT_IN_ALLOWLIST'
  | 'SENDER_HAS_NO_WALLET'
  | 'SENDER_BANNED'
  | 'RECIPIENT_FID_INVALID'
  | 'RECIPIENT_HAS_NO_WALLET'
  | 'RECIPIENT_BANNED'
  | 'SELF_TIP'
  | 'SENDER_NOT_STAKED'
  | 'CAST_ALREADY_USED'
  | 'INSUFFICIENT_TIP_BALANCE'
  | 'AMOUNT_BELOW_MIN'
  | 'AMOUNT_ABOVE_MAX'
  | 'NEYNAR_ERROR'
  | 'CHAIN_ERROR';

export interface TipApproval {
  ok: true;
  parsed: ParsedTip;
  fromWallet: Address;
  fromFid: number;
  fromUsername?: string;
  toWallet: Address;
  toFid: number;
  toUsername?: string;
  castTimestamp: Date;
}

export interface TipRejection {
  ok: false;
  reason: TipReject;
  detail?: string;
}

export type TipVerificationResult = TipApproval | TipRejection;

// ============================================================
// Single-gate helpers
// ============================================================

/** Gate 11: sender must have ≥ $1 PIZZA staked. */
export async function senderHasMinStake(senderWallet: Address): Promise<boolean> {
  try {
    const stakeInfo = await publicClient.readContract({
      address: PIZZA_STAKING_ADDRESS as Address,
      abi: PIZZA_STAKING_ABI,
      functionName: 'getStakeInfo',
      args: [senderWallet],
    }) as readonly [bigint, bigint, bigint, number, bigint, bigint, boolean];

    const totalStaked = stakeInfo[0];
    if (totalStaked === 0n) return false;

    // getMinStake() returns $1 worth of PIZZA at current oracle price
    const minStake = await publicClient.readContract({
      address: PIZZA_STAKING_ADDRESS as Address,
      abi: PIZZA_STAKING_ABI,
      functionName: 'getMinStake',
    }) as bigint;

    return totalStaked >= minStake;
  } catch (err) {
    console.error('[verifyTipCast] senderHasMinStake error:', err);
    return false;
  }
}

/** Gate 13: cast hash not used on-chain. */
export async function isCastHashUsedOnChain(
  vaultAddress: Address,
  castHash: `0x${string}`
): Promise<boolean> {
  try {
    // Vault ABI minimal — we'll wire the full ABI when the vault is deployed
    const used = await publicClient.readContract({
      address: vaultAddress,
      abi: [
        {
          type: 'function',
          name: 'usedCastHashes',
          stateMutability: 'view',
          inputs: [{ type: 'bytes32' }],
          outputs: [{ type: 'bool' }],
        },
      ] as const,
      functionName: 'usedCastHashes',
      args: [castHash],
    });
    return Boolean(used);
  } catch (err) {
    console.error('[verifyTipCast] isCastHashUsedOnChain error:', err);
    // Fail closed — if we can't verify, reject
    return true;
  }
}

/** Gate 14: sender's tip balance ≥ amount. */
export async function senderTipBalanceAtLeast(
  vaultAddress: Address,
  sender: Address,
  amountWei: bigint
): Promise<boolean> {
  try {
    const balance = await publicClient.readContract({
      address: vaultAddress,
      abi: [
        {
          type: 'function',
          name: 'tipBalance',
          stateMutability: 'view',
          inputs: [{ type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
      ] as const,
      functionName: 'tipBalance',
      args: [sender],
    }) as bigint;
    return balance >= amountWei;
  } catch (err) {
    console.error('[verifyTipCast] senderTipBalanceAtLeast error:', err);
    return false;
  }
}

// ============================================================
// Main entry point
// ============================================================

export interface VerifyTipInput {
  /** The cast object as returned by Neynar (or our internal shape). */
  cast: {
    hash: string;
    text: string;
    timestamp: string; // ISO
    parent_hash?: string | null;
    parent_fid?: number | null;
    author: { fid: number; username?: string };
  };
  /** Sender's primary wallet (already resolved via Neynar bulk-by-address). */
  fromWallet: Address;
  /** Sender's FID. */
  fromFid: number;
  /** Sender's Farcaster username (optional). */
  fromUsername?: string;
  /** Recipient's primary wallet (already resolved via Neynar). */
  toWallet: Address;
  /** Recipient's FID. */
  toFid: number;
  /** Recipient's Farcaster username (optional). */
  toUsername?: string;
}

/**
 * Run all pre-flight gates for a tip cast.
 * Returns ok=true with parsed amount, or ok=false with reason.
 *
 * NOTE: this does NOT execute the tip. The API layer calls the backend signer
 * separately after verifying ok=true.
 */
export async function verifyTipCast(input: VerifyTipInput): Promise<TipVerificationResult> {
  const { cast, fromWallet, fromFid, toWallet, toFid } = input;

  // Gate 1: must be a reply
  if (!cast.parent_hash) {
    return { ok: false, reason: 'NOT_A_REPLY' };
  }

  // Gate 2: cast text contains a valid tip pattern
  const parsed = parseTipCast(cast.text);
  if (!parsed) {
    return { ok: false, reason: 'NO_TIP_PATTERN' };
  }

  // Gate 2a: amount within contract bounds (cheap client-side rejection
  // saves a wasted backend signer tx). Contract values:
  //   minTipAmount   = 1,000 PIZZA
  //   maxTipPerCast  = 10,000,000 PIZZA
  if (parsed.amountWei < MIN_TIP_AMOUNT_WEI) {
    return { ok: false, reason: 'AMOUNT_BELOW_MIN', detail: `${parsed.amountWhole}` };
  }
  if (parsed.amountWei > MAX_TIP_PER_CAST_WEI) {
    return { ok: false, reason: 'AMOUNT_ABOVE_MAX', detail: `${parsed.amountWhole}` };
  }

  // Gate 3: cast is < 10 minutes old
  const castTimestampMs = Date.parse(cast.timestamp);
  if (Number.isNaN(castTimestampMs)) {
    return { ok: false, reason: 'CAST_TOO_OLD', detail: 'invalid timestamp' };
  }
  const castTimestamp = new Date(castTimestampMs);
  const ageMs = Date.now() - castTimestampMs;
  // Allow up to 60s of clock skew on the future side
  if (ageMs > 10 * 60 * 1000 || ageMs < -60_000) {
    return { ok: false, reason: 'CAST_TOO_OLD', detail: `age=${ageMs}ms` };
  }

  // Gate 4: sender must be on tip allowlist (until public launch)
  if (!canTip(fromFid)) {
    return { ok: false, reason: 'SENDER_NOT_IN_ALLOWLIST' };
  }

  // Gate 5: sender wallet exists
  if (!fromWallet || fromWallet === ('0x0000000000000000000000000000000000000000' as Address)) {
    return { ok: false, reason: 'SENDER_HAS_NO_WALLET' };
  }

  // Gate 6: sender wallet/FID not banned
  if (isAddressBanned(fromWallet) || isFidBanned(fromFid)) {
    return { ok: false, reason: 'SENDER_BANNED' };
  }

  // Gate 7: recipient FID > 0
  if (!toFid || toFid <= 0) {
    return { ok: false, reason: 'RECIPIENT_FID_INVALID' };
  }

  // Gate 8: recipient wallet exists
  if (!toWallet || toWallet === ('0x0000000000000000000000000000000000000000' as Address)) {
    return { ok: false, reason: 'RECIPIENT_HAS_NO_WALLET' };
  }

  // Gate 9: recipient not banned
  if (isAddressBanned(toWallet) || isFidBanned(toFid)) {
    return { ok: false, reason: 'RECIPIENT_BANNED' };
  }

  // Gate 10: from != to
  if (fromWallet.toLowerCase() === toWallet.toLowerCase()) {
    return { ok: false, reason: 'SELF_TIP' };
  }

  // Gate 11: sender has staked ≥ $1 PIZZA
  const hasMinStake = await senderHasMinStake(fromWallet);
  if (!hasMinStake) {
    return { ok: false, reason: 'SENDER_NOT_STAKED' };
  }

  // Gates 12, 13, 14 require the deployed vault address.
  // The API route handles those after we know the vault is wired up.
  return {
    ok: true,
    parsed,
    fromWallet,
    fromFid,
    fromUsername: input.fromUsername,
    toWallet,
    toFid,
    toUsername: input.toUsername,
    castTimestamp,
  };
}
