// GET /api/tip/balance/:wallet
//
// Returns:
//   {
//     balance: "0",        // wei (string, BigInt-safe)
//     balanceWhole: "0",   // PIZZA whole units, no decimals
//     paused: false,       // vault pause state
//     limits: {
//       minTip: "1000",       // whole PIZZA
//       maxTipPerCast: "10000000",
//       maxCreditPerTx: "100000000"
//     },
//     vaultAddress: "0x...",
//     vaultDeployed: true | false
//   }
//
// Used by the staking page UI to display the player's tip balance.
// Cached for 10 seconds at the edge.

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, fallback, type Address } from 'viem';
import { base } from 'viem/chains';
import {
  PIZZA_TIPPING_VAULT_ADDRESS,
  PIZZA_TIPPING_VAULT_ABI,
} from '@/app/lib/constants';

export const maxDuration = 15;

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as Address;

const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', { timeout: 15_000 }),
    http('https://base-rpc.publicnode.com', { timeout: 15_000 }),
    http('https://base.meowrpc.com', { timeout: 15_000 }),
  ]),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'cache-control': 'public, s-maxage=10, stale-while-revalidate=30',
    },
  });
}

export async function OPTIONS() {
  return json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await context.params;

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return json({ error: 'Invalid wallet address' }, 400);
  }

  const userAddr = wallet as Address;
  const vault = PIZZA_TIPPING_VAULT_ADDRESS as Address;
  const vaultDeployed = vault !== ZERO_ADDR;

  // If vault not deployed yet, return zeros so UI renders cleanly
  if (!vaultDeployed) {
    return json({
      balance: '0',
      balanceWhole: '0',
      paused: false,
      limits: {
        minTip: '1000',
        maxTipPerCast: '10000000',
        maxCreditPerTx: '100000000',
      },
      lifetime: {
        sent: '0',
        sentWhole: '0',
        received: '0',
        receivedWhole: '0',
        sentCount: '0',
        receivedCount: '0',
      },
      vaultAddress: vault,
      vaultDeployed: false,
    });
  }

  try {
    const [
      balance,
      paused,
      minTip,
      maxTip,
      maxCredit,
      lifetimeSent,
      lifetimeReceived,
      lifetimeSentCount,
      lifetimeReceivedCount,
    ] = await publicClient.multicall({
      contracts: [
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'tipBalance', args: [userAddr] },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'paused' },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'minTipAmount' },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'maxTipPerCast' },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'maxCreditPerTx' },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'lifetimeTipsSent', args: [userAddr] },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'lifetimeTipsReceived', args: [userAddr] },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'lifetimeTipsSentCount', args: [userAddr] },
        { address: vault, abi: PIZZA_TIPPING_VAULT_ABI, functionName: 'lifetimeTipsReceivedCount', args: [userAddr] },
      ],
      allowFailure: true,
    });

    const balanceWei = balance.status === 'success' ? (balance.result as bigint) : 0n;
    const isPaused = paused.status === 'success' ? Boolean(paused.result) : false;
    const minTipWei = minTip.status === 'success' ? (minTip.result as bigint) : 1_000n * 10n ** 18n;
    const maxTipWei = maxTip.status === 'success' ? (maxTip.result as bigint) : 10_000_000n * 10n ** 18n;
    const maxCreditWei = maxCredit.status === 'success' ? (maxCredit.result as bigint) : 100_000_000n * 10n ** 18n;
    const lifetimeSentWei = lifetimeSent.status === 'success' ? (lifetimeSent.result as bigint) : 0n;
    const lifetimeReceivedWei = lifetimeReceived.status === 'success' ? (lifetimeReceived.result as bigint) : 0n;
    const lifetimeSentN = lifetimeSentCount.status === 'success' ? (lifetimeSentCount.result as bigint) : 0n;
    const lifetimeReceivedN = lifetimeReceivedCount.status === 'success' ? (lifetimeReceivedCount.result as bigint) : 0n;

    return json({
      balance: balanceWei.toString(),
      balanceWhole: (balanceWei / 10n ** 18n).toString(),
      paused: isPaused,
      limits: {
        minTip: (minTipWei / 10n ** 18n).toString(),
        maxTipPerCast: (maxTipWei / 10n ** 18n).toString(),
        maxCreditPerTx: (maxCreditWei / 10n ** 18n).toString(),
      },
      lifetime: {
        sent: lifetimeSentWei.toString(),
        sentWhole: (lifetimeSentWei / 10n ** 18n).toString(),
        received: lifetimeReceivedWei.toString(),
        receivedWhole: (lifetimeReceivedWei / 10n ** 18n).toString(),
        sentCount: lifetimeSentN.toString(),
        receivedCount: lifetimeReceivedN.toString(),
      },
      vaultAddress: vault,
      vaultDeployed: true,
    });
  } catch (err) {
    console.error('[tip/balance] read error:', err);
    return json({ error: 'Failed to read vault state' }, 500);
  }
}
