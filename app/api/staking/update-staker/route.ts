import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const PIZZA_STAKING_ADDRESS = '0xCbAf5bACe5419710C3852653d3DdEB831d7415be'

// ABI for getStakeInfo
const STAKING_ABI = [
  {
    type: 'function',
    name: 'getStakeInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address', name: 'user' }],
    outputs: [
      { type: 'uint256', name: 'totalStakedAmount' },
      { type: 'uint256', name: 'flexibleAmount' },
      { type: 'uint256', name: 'lockedAmount' },
      { type: 'uint8', name: 'tier' },
      { type: 'uint256', name: 'lockEndTimestamp' },
      { type: 'uint256', name: 'totalPendingRewards' },
      { type: 'bool', name: 'isEarlyBoostActive' }
    ]
  }
] as const

// Create public client
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
})

// Helper for JSON responses
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return json({ ok: true })
}

// Helper to update a single staker
async function updateSingleStaker(wallet: string, neynarApiKey?: string): Promise<{ action: 'updated' | 'removed'; wallet: string } | null> {
  try {
    // Get current stake info from blockchain
    const stakeInfo = await publicClient.readContract({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'getStakeInfo',
      args: [wallet as `0x${string}`],
    })

    const totalStaked = stakeInfo[0]

    if (totalStaked === 0n) {
      // User unstaked completely - remove from database
      await prisma.staker.deleteMany({ where: { wallet } })
      return { action: 'removed', wallet }
    }

    // Fetch Farcaster profile
    let profile: { fid?: number; username?: string; displayName?: string; pfpUrl?: string } = {}

    if (neynarApiKey) {
      try {
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${wallet}`,
          { headers: { api_key: neynarApiKey } }
        )

        if (response.ok) {
          const data = await response.json()
          const users = data[wallet]
          if (users && users.length > 0) {
            const user = users[0]
            profile = {
              fid: user.fid,
              username: user.username,
              displayName: user.display_name,
              pfpUrl: user.pfp_url,
            }
          }
        }
      } catch (err) {
        console.error('[Update Staker] Error fetching Farcaster profile:', err)
      }
    }

    // Upsert staker in database
    await prisma.staker.upsert({
      where: { wallet },
      create: {
        wallet,
        totalStaked: totalStaked.toString(),
        flexibleAmount: stakeInfo[1].toString(),
        lockedAmount: stakeInfo[2].toString(),
        tier: stakeInfo[3],
        fid: profile.fid,
        username: profile.username,
        displayName: profile.displayName,
        pfpUrl: profile.pfpUrl,
      },
      update: {
        totalStaked: totalStaked.toString(),
        flexibleAmount: stakeInfo[1].toString(),
        lockedAmount: stakeInfo[2].toString(),
        tier: stakeInfo[3],
        // Only update profile if we got new data
        ...(profile.fid ? {
          fid: profile.fid,
          username: profile.username,
          displayName: profile.displayName,
          pfpUrl: profile.pfpUrl,
        } : {}),
      },
    })

    return { action: 'updated', wallet }
  } catch (err) {
    console.error(`[Update Staker] Error updating ${wallet}:`, err)
    return null
  }
}

// POST /api/staking/update-staker - Update staker's data and refresh all existing stakers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const newWallet = body.wallet?.toLowerCase()

    if (!newWallet || !/^0x[a-f0-9]{40}$/i.test(newWallet)) {
      return json({ error: 'Invalid wallet address' }, 400)
    }

    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY

    // First, update the new staker (the one who just staked/unstaked)
    const newStakerResult = await updateSingleStaker(newWallet, NEYNAR_API_KEY)

    // Then, get all existing stakers from database and update them too
    const existingStakers = await prisma.staker.findMany({
      select: { wallet: true },
    })

    // Use multicall to batch update all existing stakers efficiently
    const otherWallets = existingStakers
      .map(s => s.wallet)
      .filter(w => w !== newWallet)

    if (otherWallets.length > 0) {
      // Batch the contract reads using multicall
      const contractCalls = otherWallets.map(wallet => ({
        address: PIZZA_STAKING_ADDRESS as `0x${string}`,
        abi: STAKING_ABI,
        functionName: 'getStakeInfo',
        args: [wallet as `0x${string}`],
      } as const))

      const results = await publicClient.multicall({ contracts: contractCalls, allowFailure: true })

      // Update each staker in database
      for (let i = 0; i < otherWallets.length; i++) {
        const wallet = otherWallets[i]
        const result = results[i]

        if (result.status === 'success' && result.result) {
          const stakeInfo = result.result as [bigint, bigint, bigint, number, bigint, bigint, boolean]
          const totalStaked = stakeInfo[0]

          if (totalStaked === 0n) {
            // User unstaked completely - remove from database
            await prisma.staker.deleteMany({ where: { wallet } })
          } else {
            // Update stake amounts (don't refetch profiles for existing stakers to save API calls)
            await prisma.staker.update({
              where: { wallet },
              data: {
                totalStaked: totalStaked.toString(),
                flexibleAmount: stakeInfo[1].toString(),
                lockedAmount: stakeInfo[2].toString(),
                tier: stakeInfo[3],
              },
            })
          }
        }
      }
    }

    return json({
      success: true,
      newStaker: newStakerResult,
      existingStakersUpdated: otherWallets.length,
    })
  } catch (error) {
    console.error('[Update Staker] Error:', error)
    return json({ error: 'Failed to update stakers' }, 500)
  }
}
