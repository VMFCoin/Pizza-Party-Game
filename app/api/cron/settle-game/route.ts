import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { PIZZA_PARTY_ADDRESS, PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants';

// Contract address from constants (PIZZA Party v2)
const CONTRACT_ADDRESS = PIZZA_PARTY_ADDRESS as `0x${string}`;
const PARLOR_CONTRACT = PARLOR_MANAGER_ADDRESS as `0x${string}`;

// Base mainnet RPC
const RPC_URL = 'https://mainnet.base.org';

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
  {
    inputs: [],
    name: 'toppingToPizza',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
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

// PIZZA token address on Base
const PIZZA_TOKEN_ADDRESS = '0xbD0e3768B9A7C3d53e7b92EDC4C38728E2fA9b69';

// Fetch price from Dexscreener
async function fetchDexscreenerPrice(): Promise<number> {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${PIZZA_TOKEN_ADDRESS}`,
    { signal: AbortSignal.timeout(10000) } // 10 second timeout
  );
  if (!response.ok) throw new Error(`Dexscreener returned ${response.status}`);
  const data = await response.json();
  if (data.pairs && data.pairs.length > 0) {
    const price = parseFloat(data.pairs[0].priceUsd);
    if (price > 0) return price;
  }
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
  const retryDelay = 2000; // 2 seconds between retries

  // Try Dexscreener first with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const price = await fetchDexscreenerPrice();
      console.log(`[Settle Bot] PIZZA price from Dexscreener: $${price}`);
      return price;
    } catch (e) {
      console.warn(`[Settle Bot] Dexscreener attempt ${attempt}/${maxRetries} failed:`, e instanceof Error ? e.message : e);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Fallback to GeckoTerminal with retries
  console.log(`[Settle Bot] Dexscreener failed, trying GeckoTerminal...`);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const price = await fetchGeckoTerminalPrice();
      console.log(`[Settle Bot] PIZZA price from GeckoTerminal: $${price}`);
      return price;
    } catch (e) {
      console.warn(`[Settle Bot] GeckoTerminal attempt ${attempt}/${maxRetries} failed:`, e instanceof Error ? e.message : e);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.error(`[Settle Bot] CRITICAL: All price sources failed after ${maxRetries} retries each!`);
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

    // Create clients with Base mainnet RPC
    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(RPC_URL),
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
    // Add delay between daily and weekly to avoid RPC rate limits
    if (isMonday) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
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
          // Get weekly game data, toppingToPizza value, and PIZZA price for USD calculation
          const [weeklyGame, toppingToPizzaRaw, pizzaPrice] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: SETTLE_ABI,
              functionName: 'weeklyGames',
              args: [weeklyGameId],
            }),
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: SETTLE_ABI,
              functionName: 'toppingToPizza',
            }),
            getPizzaPrice(),
          ]);

          // weeklyGame returns: [claimWindowStart, claimWindowEnd, totalClaimedToppings, potAmount, settled]
          const totalClaimedToppings = weeklyGame[2];
          // toppingToPizza is in wei (e.g., 1e18 = 1 PIZZA per topping)
          const toppingToPizza = parseFloat(formatUnits(toppingToPizzaRaw, 18));
          // Weekly jackpot = totalClaimedToppings * toppingToPizza PIZZA
          const jackpotPizza = Number(totalClaimedToppings) * toppingToPizza;
          const winnerCount = 10; // WEEKLY_WINNERS constant
          const pizzaPerWinner = jackpotPizza / winnerCount;
          const usdPerWinner = pizzaPerWinner * pizzaPrice;
          const usdCentsPerWinner = Math.round(usdPerWinner * 100); // Convert to cents

          console.log(`[Settle Bot] Settling weekly game ${weeklyGameId}, totalToppings: ${totalClaimedToppings}, toppingToPizza: ${toppingToPizza}, jackpot: ${jackpotPizza} PIZZA`);
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
            // Fallback to old function if price fetch failed - this should be rare with retry/fallback logic
            console.error(`[Settle Bot] CRITICAL WARNING: Weekly USD snapshot failed! Using fallback settlement without USD.`);
            console.error(`[Settle Bot] Week ${weeklyGameId} will show incorrect USD values on leaderboard.`);
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

            // --- UPDATE TREASURY BONUS FOR NEXT WEEK ---
            // Set the bonus to $20 worth of PIZZA at current price
            const TARGET_USD = 20; // $20 minimum jackpot
            if (pizzaPrice > 0) {
              const bonusPizza = TARGET_USD / pizzaPrice;
              const bonusWei = BigInt(Math.floor(bonusPizza * 1e18));

              console.log(`[Settle Bot] Setting treasury bonus for next week: ${bonusPizza.toFixed(2)} PIZZA ($${TARGET_USD} at $${pizzaPrice})`);

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
                  console.log(`[Settle Bot] Treasury bonus updated! TX: ${bonusHash}`);
                  (results.weekly as { treasuryBonusUpdated?: boolean; newBonusPizza?: string }).treasuryBonusUpdated = true;
                  (results.weekly as { newBonusPizza?: string }).newBonusPizza = bonusPizza.toFixed(2);
                } else {
                  console.error(`[Settle Bot] Failed to update treasury bonus`);
                }
              } catch (bonusErr) {
                console.error(`[Settle Bot] Error updating treasury bonus:`, bonusErr);
              }
            } else {
              console.warn(`[Settle Bot] Skipping treasury bonus update - no valid price`);
            }
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
