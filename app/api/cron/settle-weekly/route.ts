import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, formatUnits, fallback } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PIZZA_PARTY_ADDRESS, PIZZA_TOKEN_ADDRESS } from '@/app/lib/constants';

// Allow up to 120s for settlement (Pro plan supports up to 300s)
export const maxDuration = 120;

// Contract address from constants (PIZZA Party v2)
const CONTRACT_ADDRESS = PIZZA_PARTY_ADDRESS as `0x${string}`;

// Base mainnet RPCs with fallback
const RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
];

const SETTLE_ABI = [
  {
    inputs: [],
    name: 'weeklyGameId',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isWeeklyGameReady',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'weekId' }],
    name: 'weeklyGames',
    outputs: [
      { type: 'uint256', name: 'claimWindowStart' },
      { type: 'uint256', name: 'claimWindowEnd' },
      { type: 'uint256', name: 'totalClaimedToppings' },
      { type: 'uint256', name: 'potAmount' },
      { type: 'bool', name: 'settled' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'settleWeeklyGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'usdCentsPerWinner' }],
    name: 'settleWeeklyGameWithUsd',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'toppingUnitPizza',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'newUnit' }],
    name: 'setToppingUnitPizza',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'newAmount' }],
    name: 'setWeeklyTreasuryBonus',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'weeklyTreasuryBonus',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Fetch price from Dexscreener.
// Pick the Base pair with the most 24h volume — falls back to highest liquidity
// only when every pair shows zero volume. A high-TVL pool with no trading is a
// stale quote and was producing ~1/2.5x of the true price.
async function fetchDexscreenerPrice(): Promise<number> {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${PIZZA_TOKEN_ADDRESS}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) throw new Error(`Dexscreener returned ${response.status}`);
  const data = await response.json();
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  const basePairs = pairs.filter(
    (p: { chainId?: string; priceUsd?: string }) =>
      p.chainId === 'base' && parseFloat(p.priceUsd ?? '0') > 0
  );
  if (basePairs.length === 0) throw new Error('No valid price from Dexscreener');

  const withVolume = basePairs.filter(
    (p: { volume?: { h24?: number } }) => (p.volume?.h24 ?? 0) > 0
  );
  const ranked = (withVolume.length > 0 ? withVolume : basePairs).sort(
    (
      a: { volume?: { h24?: number }; liquidity?: { usd?: number } },
      b: { volume?: { h24?: number }; liquidity?: { usd?: number } }
    ) =>
      withVolume.length > 0
        ? (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0)
        : (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
  );

  const price = parseFloat(ranked[0].priceUsd);
  if (price > 0) return price;
  throw new Error('No valid price from Dexscreener');
}

// Fetch price from GeckoTerminal (backup)
async function fetchGeckoTerminalPrice(): Promise<number> {
  const response = await fetch(
    `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${PIZZA_TOKEN_ADDRESS}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`);
  const data = await response.json();
  const priceStr = data?.data?.attributes?.token_prices?.[PIZZA_TOKEN_ADDRESS.toLowerCase()];
  if (priceStr) {
    const price = parseFloat(priceStr);
    if (price > 0) return price;
  }
  throw new Error('No valid price from GeckoTerminal');
}

// Robust price fetch with retries and fallback sources
async function getPizzaPrice(): Promise<number> {
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const price = await fetchDexscreenerPrice();
      console.log(`[Weekly Settle] PIZZA price from Dexscreener: $${price}`);
      return price;
    } catch (e) {
      console.warn(`[Weekly Settle] Dexscreener attempt ${attempt}/${maxRetries} failed:`, e instanceof Error ? e.message : e);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.log(`[Weekly Settle] Dexscreener failed, trying GeckoTerminal...`);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const price = await fetchGeckoTerminalPrice();
      console.log(`[Weekly Settle] PIZZA price from GeckoTerminal: $${price}`);
      return price;
    } catch (e) {
      console.warn(`[Weekly Settle] GeckoTerminal attempt ${attempt}/${maxRetries} failed:`, e instanceof Error ? e.message : e);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.error(`[Weekly Settle] CRITICAL: All price sources failed!`);
  return 0;
}

export async function GET(request: NextRequest) {
  // Verify this is from Vercel Cron or authorized
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  const isVercelCron = cronHeader === '1';
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isAuthorized) {
    console.log('[Weekly Settle] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if it's Monday (PST)
  const now = new Date();
  const pstTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const isMonday = pstTime.getDay() === 1;

  if (!isMonday) {
    console.log(`[Weekly Settle] Not Monday (${pstTime.toDateString()}), skipping`);
    return NextResponse.json({ success: true, message: 'Not Monday, skipping weekly settlement' });
  }

  const result: {
    success: boolean;
    txHash?: string;
    gameId?: string;
    error?: string;
    reason?: string;
    treasuryBonusUpdated?: boolean;
    newBonusPizza?: string;
  } = { success: false };

  try {
    const privateKey = process.env.AUTO_SETTLE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('AUTO_SETTLE_PRIVATE_KEY not configured');
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const transport = fallback(
      RPC_URLS.map(url => http(url, { timeout: 15_000 }))
    );

    const publicClient = createPublicClient({
      chain: base,
      transport,
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport,
    });

    console.log(`[Weekly Settle] Starting weekly settlement at ${pstTime.toISOString()}`);

    const weeklyGameId = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: SETTLE_ABI,
      functionName: 'weeklyGameId',
    });

    const isWeeklyReady = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: SETTLE_ABI,
      functionName: 'isWeeklyGameReady',
    });

    console.log(`[Weekly Settle] Weekly game ${weeklyGameId}, ready: ${isWeeklyReady}`);

    if (!isWeeklyReady) {
      result.reason = 'not_ready';
      result.gameId = weeklyGameId.toString();
      console.log(`[Weekly Settle] Weekly game not ready to settle`);
      return NextResponse.json(result);
    }

    // Get weekly game data and current PIZZA price.
    // toppingUnitPizza and weeklyTreasuryBonus will be refreshed below before settlement.
    const [weeklyGame, pizzaPrice] = await Promise.all([
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: SETTLE_ABI,
        functionName: 'weeklyGames',
        args: [weeklyGameId],
      }),
      getPizzaPrice(),
    ]);

    const totalClaimedToppings = weeklyGame[2];

    // CRITICAL: Update toppingUnitPizza and weeklyTreasuryBonus to CURRENT price BEFORE settling.
    // The contract pays out jackpot = totalClaimedToppings * toppingUnitPizza + weeklyTreasuryBonus
    // in PIZZA tokens. If these values were set when PIZZA price was higher, the PIZZA paid out
    // will be worth less USD than the displayed $20 + ($0.10 per topping).
    // Refreshing both right before settlement ensures the full USD-equivalent jackpot is paid.
    //
    // IMPORTANT: After the setters succeed, do NOT re-read on-chain state — RPC nodes can
    // return stale values immediately after a tx is mined, causing the USD snapshot to be
    // computed from old values (this caused weekly 21 to settle at $0.21/winner instead of $3.58).
    // Use the local variables we just set; they are authoritative.
    let toppingUnitPizza = 0;
    let treasuryBonus = 0;

    if (pizzaPrice > 0) {
      const TARGET_USD = 20;
      const TOPPING_USD = 0.10;
      toppingUnitPizza = TOPPING_USD / pizzaPrice;
      treasuryBonus = TARGET_USD / pizzaPrice;
      const newToppingWei = BigInt(Math.floor(toppingUnitPizza * 1e18));
      const newBonusWei = BigInt(Math.floor(treasuryBonus * 1e18));

      console.log(`[Weekly Settle] Pre-settle refresh: toppingUnit=${toppingUnitPizza.toFixed(2)} PIZZA ($0.10), treasuryBonus=${treasuryBonus.toFixed(2)} PIZZA ($20) at $${pizzaPrice}`);

      try {
        const toppingHash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'setToppingUnitPizza',
          args: [newToppingWei],
          gas: 100_000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: toppingHash });
        console.log(`[Weekly Settle] Pre-settle toppingUnitPizza set: ${toppingHash}`);

        const bonusHash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'setWeeklyTreasuryBonus',
          args: [newBonusWei],
          gas: 100_000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: bonusHash });
        console.log(`[Weekly Settle] Pre-settle treasuryBonus set: ${bonusHash}`);
      } catch (preSetErr) {
        console.error(`[Weekly Settle] CRITICAL: Pre-settle refresh failed:`, preSetErr);
        // If setters fell back, read on-chain to get whatever values will actually be used
        const [tppFallback, bonusFallback] = await Promise.all([
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'toppingUnitPizza',
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'weeklyTreasuryBonus',
          }),
        ]);
        toppingUnitPizza = parseFloat(formatUnits(tppFallback, 18));
        treasuryBonus = parseFloat(formatUnits(bonusFallback, 18));
      }
    } else {
      console.error(`[Weekly Settle] CRITICAL: No price available, reading existing on-chain values`);
      const [tppFallback, bonusFallback] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'toppingUnitPizza',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'weeklyTreasuryBonus',
        }),
      ]);
      toppingUnitPizza = parseFloat(formatUnits(tppFallback, 18));
      treasuryBonus = parseFloat(formatUnits(bonusFallback, 18));
    }

    // Weekly jackpot = totalClaimedToppings * toppingUnitPizza ($0.10 per topping) + treasuryBonus
    const jackpotPizza = Number(totalClaimedToppings) * toppingUnitPizza + treasuryBonus;
    const winnerCount = 10; // WEEKLY_WINNERS constant
    const pizzaPerWinner = jackpotPizza / winnerCount;
    const usdPerWinner = pizzaPerWinner * pizzaPrice;
    const usdCentsPerWinner = Math.round(usdPerWinner * 100);

    console.log(`[Weekly Settle] Settling weekly game ${weeklyGameId}`);
    console.log(`[Weekly Settle] totalToppings: ${totalClaimedToppings}, toppingUnitPizza: ${toppingUnitPizza}, treasuryBonus: ${treasuryBonus}`);
    console.log(`[Weekly Settle] jackpot: ${jackpotPizza} PIZZA, PIZZA price: $${pizzaPrice}`);
    console.log(`[Weekly Settle] USD per winner: $${usdPerWinner.toFixed(2)} (${usdCentsPerWinner} cents)`);

    let hash: `0x${string}`;
    if (usdCentsPerWinner > 0) {
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: SETTLE_ABI,
        functionName: 'settleWeeklyGameWithUsd',
        args: [BigInt(usdCentsPerWinner)],
        gas: 2_000_000n,
      });
    } else {
      console.error(`[Weekly Settle] CRITICAL WARNING: Weekly USD snapshot failed!`);
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: SETTLE_ABI,
        functionName: 'settleWeeklyGame',
        gas: 2_000_000n,
      });
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      result.success = true;
      result.txHash = hash;
      result.gameId = weeklyGameId.toString();
      console.log(`[Weekly Settle] Weekly game ${weeklyGameId} settled! TX: ${hash}`);

      // --- UPDATE TREASURY BONUS FOR NEXT WEEK ---
      const TARGET_USD = 20; // $20 minimum jackpot
      if (pizzaPrice > 0) {
        const bonusPizza = TARGET_USD / pizzaPrice;
        const bonusWei = BigInt(Math.floor(bonusPizza * 1e18));

        console.log(`[Weekly Settle] Setting treasury bonus for next week: ${bonusPizza.toFixed(2)} PIZZA ($${TARGET_USD} at $${pizzaPrice})`);

        try {
          const bonusHash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'setWeeklyTreasuryBonus',
            args: [bonusWei],
            gas: 100_000n,
          });

          const bonusReceipt = await publicClient.waitForTransactionReceipt({ hash: bonusHash });
          if (bonusReceipt.status === 'success') {
            console.log(`[Weekly Settle] Treasury bonus updated! TX: ${bonusHash}`);
            result.treasuryBonusUpdated = true;
            result.newBonusPizza = bonusPizza.toFixed(2);
          } else {
            console.error(`[Weekly Settle] Failed to update treasury bonus`);
          }
        } catch (bonusErr) {
          console.error(`[Weekly Settle] Error updating treasury bonus:`, bonusErr);
        }

        // --- UPDATE TOPPING UNIT PIZZA FOR NEXT WEEK ---
        // 1 topping = $0.10 worth of PIZZA
        const TOPPING_USD = 0.10;
        const toppingPizza = TOPPING_USD / pizzaPrice;
        const toppingWei = BigInt(Math.floor(toppingPizza * 1e18));

        console.log(`[Weekly Settle] Setting toppingUnitPizza for next week: ${toppingPizza.toFixed(4)} PIZZA ($${TOPPING_USD} at $${pizzaPrice})`);

        try {
          const toppingHash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'setToppingUnitPizza',
            args: [toppingWei],
            gas: 100_000n,
          });

          const toppingReceipt = await publicClient.waitForTransactionReceipt({ hash: toppingHash });
          if (toppingReceipt.status === 'success') {
            console.log(`[Weekly Settle] toppingUnitPizza updated! TX: ${toppingHash}`);
          } else {
            console.error(`[Weekly Settle] Failed to update toppingUnitPizza`);
          }
        } catch (toppingErr) {
          console.error(`[Weekly Settle] Error updating toppingUnitPizza:`, toppingErr);
        }
      } else {
        console.warn(`[Weekly Settle] Skipping treasury bonus and toppingUnitPizza update - no valid price`);
      }
    } else {
      result.error = 'Transaction failed';
      result.gameId = weeklyGameId.toString();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Weekly Settle] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Weekly settlement failed',
    }, { status: 500 });
  }
}
