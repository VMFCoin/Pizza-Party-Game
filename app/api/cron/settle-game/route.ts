import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PIZZA_PARTY_ADDRESS, PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants';

// Contract address from constants (PIZZA Party v2)
const CONTRACT_ADDRESS = PIZZA_PARTY_ADDRESS as `0x${string}`;
const PARLOR_CONTRACT = PARLOR_MANAGER_ADDRESS as `0x${string}`;

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
    inputs: [],
    name: 'settleDailyGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'usdCentsPerWinner' }],
    name: 'settleDailyGameWithUsd',
    outputs: [],
    stateMutability: 'nonpayable',
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
] as const;

// Fetch PIZZA price from Dexscreener to calculate USD value at settlement
async function getPizzaPrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.dexscreener.com/latest/dex/tokens/0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69'
    );
    const data = await response.json();
    if (data.pairs && data.pairs.length > 0) {
      const price = parseFloat(data.pairs[0].priceUsd);
      console.log(`[Settle Bot] PIZZA price: $${price}`);
      return price;
    }
  } catch (e) {
    console.error('[Settle Bot] Failed to fetch PIZZA price:', e);
  }
  return 0;
}

// ParlorManager ABI for allocateFees
const PARLOR_ABI = [
  {
    inputs: [],
    name: 'allocateFees',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pendingFees',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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
    parlorFees: { success: boolean; txHash?: string; error?: string; reason?: string } | null;
  } = {
    daily: null,
    weekly: null,
    parlorFees: null,
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
        // Check player count and pot for logging
        const [players, currentPot, pizzaPrice] = await Promise.all([
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
          getPizzaPrice(),
        ]);

        const potFloat = parseFloat(formatUnits(currentPot, 18));
        const winnerCount = Math.min(players.length, 8); // Max 8 winners
        const pizzaPerWinner = winnerCount > 0 ? (potFloat * 0.94) / winnerCount : 0;
        const usdPerWinner = pizzaPerWinner * pizzaPrice;
        const usdCentsPerWinner = Math.round(usdPerWinner * 100); // Convert to cents

        console.log(`[Settle Bot] Settling daily game ${dailyGameId} with ${players.length} players, pot: ${potFloat.toFixed(2)} PIZZA`);
        console.log(`[Settle Bot] PIZZA price: $${pizzaPrice}, USD per winner: $${usdPerWinner.toFixed(2)} (${usdCentsPerWinner} cents)`);

        let hash: `0x${string}`;
        if (usdCentsPerWinner > 0) {
          // Use new function that locks USD value
          hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'settleDailyGameWithUsd',
            args: [BigInt(usdCentsPerWinner)],
            gas: 2_000_000n,
          });
        } else {
          // Fallback to old function if price fetch failed
          console.log(`[Settle Bot] Warning: Using fallback settlement (no USD snapshot)`);
          hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'settleDailyGame',
            gas: 2_000_000n,
          });
        }

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
          // Get weekly game data and PIZZA price for USD calculation
          const [weeklyGame, pizzaPrice] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: SETTLE_ABI,
              functionName: 'weeklyGames',
              args: [weeklyGameId],
            }),
            getPizzaPrice(),
          ]);

          // weeklyGame returns: [claimWindowStart, claimWindowEnd, totalClaimedToppings, potAmount, settled]
          const totalClaimedToppings = weeklyGame[2];
          // Weekly jackpot = totalClaimedToppings * 100 PIZZA (TOPPING_TO_PIZZA constant)
          const jackpotPizza = Number(totalClaimedToppings) * 100;
          const winnerCount = 10; // WEEKLY_WINNERS constant
          const pizzaPerWinner = jackpotPizza / winnerCount;
          const usdPerWinner = pizzaPerWinner * pizzaPrice;
          const usdCentsPerWinner = Math.round(usdPerWinner * 100); // Convert to cents

          console.log(`[Settle Bot] Settling weekly game ${weeklyGameId}, totalToppings: ${totalClaimedToppings}, jackpot: ${jackpotPizza} PIZZA`);
          console.log(`[Settle Bot] PIZZA price: $${pizzaPrice}, USD per winner: $${usdPerWinner.toFixed(2)} (${usdCentsPerWinner} cents)`);

          let hash: `0x${string}`;
          if (usdCentsPerWinner > 0) {
            // Use new function that locks USD value
            hash = await walletClient.writeContract({
              address: CONTRACT_ADDRESS,
              abi: SETTLE_ABI,
              functionName: 'settleWeeklyGameWithUsd',
              args: [BigInt(usdCentsPerWinner)],
              gas: 2_000_000n,
            });
          } else {
            // Fallback to old function if price fetch failed
            console.log(`[Settle Bot] Warning: Using fallback settlement (no USD snapshot)`);
            hash = await walletClient.writeContract({
              address: CONTRACT_ADDRESS,
              abi: SETTLE_ABI,
              functionName: 'settleWeeklyGame',
              gas: 2_000_000n,
            });
          }

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

    // --- PARLOR FEE ALLOCATION ---
    // Always check for pending parlor fees so owners can claim even if someone else settled the game
    try {
      const pendingFees = await publicClient.readContract({
        address: PARLOR_CONTRACT,
        abi: PARLOR_ABI,
        functionName: 'pendingFees',
      });

      if (pendingFees > 0n) {
        const triggeredBy = results.daily?.success || results.weekly?.success ? 'recent settlement' : 'existing pending fees';
        console.log(`[Settle Bot] Allocating parlor fees (${triggeredBy}): ${formatUnits(pendingFees, 18)} PIZZA`);

        const hash = await walletClient.writeContract({
          address: PARLOR_CONTRACT,
          abi: PARLOR_ABI,
          functionName: 'allocateFees',
          gas: 500_000n,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === 'success') {
          results.parlorFees = { success: true, txHash: hash };
          console.log(`[Settle Bot] Parlor fees allocated! TX: ${hash}`);
        } else {
          results.parlorFees = { success: false, error: 'Transaction failed' };
        }
      } else {
        results.parlorFees = { success: false, reason: 'no_pending_fees' };
        console.log(`[Settle Bot] No pending parlor fees to allocate`);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      results.parlorFees = { success: false, error };
      console.error(`[Settle Bot] Parlor fee allocation error:`, error);
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
