import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract address and ABI
const CONTRACT_ADDRESS = '0x75a2AF05B626cc7858c93787ea7240926E5797b0';

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
    name: 'settleDailyGame',
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
        // Check player count
        const players = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'getDailyGamePlayers',
          args: [dailyGameId],
        });

        console.log(`[Settle Bot] Settling daily game ${dailyGameId} with ${players.length} players`);

        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: SETTLE_ABI,
          functionName: 'settleDailyGame',
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
          console.log(`[Settle Bot] Settling weekly game ${weeklyGameId}...`);

          const hash = await walletClient.writeContract({
            address: CONTRACT_ADDRESS,
            abi: SETTLE_ABI,
            functionName: 'settleWeeklyGame',
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
