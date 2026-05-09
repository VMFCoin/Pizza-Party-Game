// Backend tipping signer client.
//
// Reads BACKEND_TIPPING_SIGNER_PRIVATE_KEY from env (Vercel + local .env).
// This is a SEPARATE EOA from the existing BACKEND_SIGNER_PRIVATE_KEY used by
// ShareAndSpin and ParlorManager — isolated blast radius.
//
// SECURITY:
//   - Never log the private key
//   - Never include the key in error messages
//   - Server-only — this file MUST NOT be imported into client bundles

import 'server-only';
import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// ============================================================
// Environment
// ============================================================

function getSignerPrivateKey(): Hex {
  const raw = process.env.BACKEND_TIPPING_SIGNER_PRIVATE_KEY;
  if (!raw) {
    throw new Error('BACKEND_TIPPING_SIGNER_PRIVATE_KEY is not set');
  }
  const k = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (k.length !== 66) {
    throw new Error('BACKEND_TIPPING_SIGNER_PRIVATE_KEY has invalid length');
  }
  return k as Hex;
}

function getSignerAddress(): Address {
  // Optional explicit address for sanity-checking the key resolves correctly
  return (process.env.BACKEND_TIPPING_SIGNER_ADDRESS || '') as Address;
}

// ============================================================
// Clients
// ============================================================

export const tippingPublicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', { timeout: 15_000 }),
    http('https://base-rpc.publicnode.com', { timeout: 15_000 }),
    http('https://base.meowrpc.com', { timeout: 15_000 }),
  ]),
});

/**
 * Build a wallet client signed by the dedicated tipping backend signer.
 * Throws if the env var is missing — caller should catch and return 500.
 */
export function getTippingWalletClient() {
  const privateKey = getSignerPrivateKey();
  const account = privateKeyToAccount(privateKey);

  // Defensive: if BACKEND_TIPPING_SIGNER_ADDRESS is set, verify it matches.
  // This catches "you put the wrong key in Vercel" before any tx goes out.
  const expectedAddress = getSignerAddress();
  if (expectedAddress && account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      'BACKEND_TIPPING_SIGNER address/key mismatch — refusing to sign'
    );
  }

  return {
    walletClient: createWalletClient({
      account,
      chain: base,
      transport: fallback([
        http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', { timeout: 15_000 }),
        http('https://base-rpc.publicnode.com', { timeout: 15_000 }),
        http('https://base.meowrpc.com', { timeout: 15_000 }),
      ]),
    }),
    address: account.address,
  };
}
