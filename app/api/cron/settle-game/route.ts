import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PIZZA_PARTY_ADDRESS, PIZZA_TOKEN_ADDRESS } from '@/app/lib/constants';

// Contract address from constants (PIZZA Party v2)
const CONTRACT_ADDRESS = PIZZA_PARTY_ADDRESS as `0x${string}`;

// Dexscreener API for PIZZA price
const DEXSCREENER_API = `https://api.dexscreener.com/latest/dex/tokens/${PIZZA_TOKEN_ADDRESS}`;

const SETTLE_ABI = [
  {
    inputs: [],
    name: 'dailyGameId',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'weeklyGameId',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isDailyGameReady',
    outputs: [{ type: 'bool' }],
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
    inputs: [{ type: 'uint256', name: 'gameId' }],
    name: 'getDailyGamePlayers',
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentDailyPot',
    outputs: [{ type: 'uint256' }],
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
    inputs: [{ type: 'uint256', name: 'usdCentsPerWinner' }],
    name: 'settleDailyGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'usdCentsPerWinner' }],
    name: 'settleWeeklyGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Fetch PIZZA price from Dexscreener
async function getPizzaPrice(): Promise<number> {
  try {
    const response = await fetch(DEXSCREENER_API);
    const data = await response.json();
    if (data.pairs && data.pairs.length > 0) {
      return parseFloat(data.pairs[0].priceUsd);
    }
  } catch (e) {
    console.error('[Settle Bot] Failed to fetch PIZZA price:', e);
  }
  return 0;
}

// Calculate USD cents per winner for daily game
function calculateDailyUsdCents(potPizza: bigint, pizzaPrice: number, winnerCount: number): bigint {
  if (pizzaPrice === 0 || winnerCount === 0) return 0n;

  const potAmount = parseFloat(formatUnits(potPizza, 18));
  const potUsd = potAmount * pizzaPrice;
  const playerPool = potUsd * 0.94; // 94% goes to players
  const perWinner = playerPool / winnerCount;
  const cents = Math.round(perWinner * 100);

  return BigInt(cents);
}

// Calculate USD cents per winner for weekly game
function calculateWeeklyUsdCents(totalToppings: bigint, pizzaPrice: number, winnerCount: number): bigint {
  if (pizzaPrice === 0 || winnerCount === 0) return 0n;

  // Jackpot = totalClaimedToppings * 100 PIZZA
  const jackpotPizza = Number(totalToppings) * 100;
  const jackpotUsd = jackpotPizza * pizzaPrice;
  const perWinner = jackpotUsd / winnerCount;
  const cents = Math.round(perWinner * 100);

  return BigInt(cents);
}

export async function GET(request: NextRequest) {
  // Verify this is from Vercel Cron or authorized
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  const isVercelCron = cronHeader === '1';
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: {
    daily: { success: boolean; txHash?: string; error?: string; gameId?: string; reason?: string } | null;
    weekly: { success: boolean; txHash?: string; error?: string; gameId?: string; reason?: string } | null;
  } = {
    daily: null,
    weekly: null,
  };

  try {
    const privateKey = process.env.AUTO_SETTLE_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: 'AUTO_SETTLE_PRIVATE_KEY not configured' }, { status: 500 });
    }

    // Create clients
    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org'),
    });

    const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http('https://mainnet.base.org'),
    });

    console.log(`[Settle Bot] Running settlement check from wallet: ${account.address}`);

    // Check if it's Monday (for weekly settlement)
    const now = new Date();
    const pstTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const isMonday = pstTime.getDay() === 1;

    // Fetch PIZZA price once for all calculations
    const pizzaPrice = await getPizzaPrice();
    console.log(`[Settle Bot] PIZZA price: $${pizzaPrice}`);

    // --- DAILY SETTLEMENT ---
    try {
      const dailyGameId = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: SETTLE_ABI,
        functionName: 'dailyGameId',
      });

      const isDailyReady = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: SETTLE_ABI,
        functionName: 'isDailyGameReady',
      });

      console.log(`[Settle Bot] Daily game ${dailyGameId}, ready: ${isDailyReady}`);

      if (isDailyReady) {
        // Check player count and pot
        const [players, currentPot] = await Promise.all([
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'getDailyGamePlayers',
            args: [dailyGameId],
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'currentDailyPot',
          }),
        ]);

        // Calculate USD cents per winner (8 winners max, or player count if less)
        const winnerCount = Math.min(players.length, 8);
        const usdCentsPerWinner = calculateDailyUsdCents(currentPot, pizzaPrice, winnerCount);

        console.log(`[Settle Bot] Settling daily game ${dailyGameId} with ${players.length} players, pot: ${formatUnits(currentPot, 18)} PIZZA, usdCents: ${usdCentsPerWinner}`);

        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'settleDailyGame',
          args: [usdCentsPerWinner],
          gas: 2_000_000n, // Increased gas limit for settlement with many players/charities
        });

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          results.daily = { success: true, txHash: hash, gameId: dailyGameId.toString() };
          console.log(`[Settle Bot] Daily game ${dailyGameId} settled! TX: ${hash}`);
        } else {
          results.daily = { success: false, error: 'Transaction failed', gameId: dailyGameId.toString() };
        }
      } else {
        results.daily = { success: false, reason: 'not_ready', gameId: dailyGameId.toString() };
        console.log(`[Settle Bot] Daily game not ready to settle`);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      results.daily = { success: false, error };
      console.error(`[Settle Bot] Daily settlement error:`, error);
    }

    // --- WEEKLY SETTLEMENT (only on Mondays) ---
    if (isMonday) {
      try {
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

        console.log(`[Settle Bot] Weekly game ${weeklyGameId}, ready: ${isWeeklyReady}`);

        if (isWeeklyReady) {
          // Get weekly game data for USD calculation
          const weeklyGame = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'weeklyGames',
            args: [weeklyGameId],
          });

          // weeklyGame returns: [claimWindowStart, claimWindowEnd, totalClaimedToppings, potAmount, settled]
          const totalClaimedToppings = weeklyGame[2];

          // Calculate winner count (10 max, or claimer count if less - but we don't have claimer count here)
          // Use 10 as the expected winner count for calculation
          const winnerCount = 10;
          const usdCentsPerWinner = calculateWeeklyUsdCents(totalClaimedToppings, pizzaPrice, winnerCount);

          console.log(`[Settle Bot] Settling weekly game ${weeklyGameId}, totalToppings: ${totalClaimedToppings}, usdCents: ${usdCentsPerWinner}`);

          const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'settleWeeklyGame',
            args: [usdCentsPerWinner],
            gas: 2_000_000n, // Increased gas limit for settlement with many players
          });

          const receipt = await publicClient.waitForTransactionReceipt({ hash });

          if (receipt.status === 'success') {
            results.weekly = { success: true, txHash: hash, gameId: weeklyGameId.toString() };
            console.log(`[Settle Bot] Weekly game ${weeklyGameId} settled! TX: ${hash}`);
          } else {
            results.weekly = { success: false, error: 'Transaction failed', gameId: weeklyGameId.toString() };
          }
        } else {
          results.weekly = { success: false, reason: 'not_ready', gameId: weeklyGameId.toString() };
          console.log(`[Settle Bot] Weekly game not ready to settle`);
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        results.weekly = { success: false, error };
        console.error(`[Settle Bot] Weekly settlement error:`, error);
      }
    } else {
      console.log(`[Settle Bot] Not Monday (${pstTime.toDateString()}), skipping weekly settlement`);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      pstTime: pstTime.toISOString(),
      isMonday,
      results,
    });
  } catch (error) {
    console.error('[Settle Bot] Fatal error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Settlement failed',
      results,
    }, { status: 500 });
  }
}
