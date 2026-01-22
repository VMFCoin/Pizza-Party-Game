import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'

const PIZZA_STAKING_ADDRESS = '0xCbAf5bACe5419710C3852653d3DdEB831d7415be'

// Staking went live around block 40800000 (mid-January 2025)
const STAKING_DEPLOY_BLOCK = 40800000n

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
  return NextResponse.json(data, { status })
}

// Helper to fetch logs with retry
async function fetchLogsWithRetry(fromBlock: bigint, toBlock: bigint, retries = 3): Promise<string[]> {
  const addresses: string[] = []
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const logs = await publicClient.getLogs({
        address: PIZZA_STAKING_ADDRESS as `0x${string}`,
        event: parseAbiItem('event Staked(address indexed user, uint256 amount, uint8 lockType, uint8 newTier)'),
        fromBlock,
        toBlock,
      })
      for (const log of logs) {
        if (log.args.user) {
          addresses.push(log.args.user.toLowerCase())
        }
      }
      return addresses
    } catch {
      if (attempt < retries - 1) {
        console.log(`[Sync Stakers] Retry ${attempt + 1} for blocks ${fromBlock}-${toBlock}`)
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      } else {
        console.error(`[Sync Stakers] Failed after ${retries} retries for blocks ${fromBlock}-${toBlock}`)
      }
    }
  }
  return addresses
}

// POST /api/staking/sync-stakers - Sync all stakers from blockchain to database
export async function POST() {
  try {
    const currentBlock = await publicClient.getBlockNumber()

    // Query Staked events to find all staker addresses
    const chunkSize = 20000n // Smaller chunks for better reliability
    const stakerAddresses = new Set<string>()

    console.log(`[Sync Stakers] Querying events from block ${STAKING_DEPLOY_BLOCK} to ${currentBlock}`)

    for (let fromBlock = STAKING_DEPLOY_BLOCK; fromBlock < currentBlock; fromBlock += chunkSize) {
      const toBlock = fromBlock + chunkSize - 1n > currentBlock ? currentBlock : fromBlock + chunkSize - 1n

      const addresses = await fetchLogsWithRetry(fromBlock, toBlock)
      for (const addr of addresses) {
        stakerAddresses.add(addr)
      }

      if (addresses.length > 0) {
        console.log(`[Sync Stakers] Found ${stakerAddresses.size} unique addresses so far (block ${fromBlock}-${toBlock})`)
      }

      // Small delay between chunks to avoid rate limiting
      await new Promise(r => setTimeout(r, 300))
    }

    if (stakerAddresses.size === 0) {
      return json({ success: true, message: 'No stakers found', count: 0 })
    }

    const addresses = Array.from(stakerAddresses)
    console.log(`[Sync Stakers] Found ${addresses.length} unique staker addresses`)

    // Use multicall to get current stake info for all addresses
    const contractCalls = addresses.map(addr => ({
      address: PIZZA_STAKING_ADDRESS as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'getStakeInfo',
      args: [addr as `0x${string}`],
    } as const))

    const results = await publicClient.multicall({ contracts: contractCalls, allowFailure: true })

    // Fetch Farcaster profiles for all addresses
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY
    const profiles: Record<string, { fid?: number; username?: string; displayName?: string; pfpUrl?: string }> = {}

    if (NEYNAR_API_KEY) {
      try {
        // Batch addresses (Neynar limit is 350 per request)
        const batchSize = 50
        for (let i = 0; i < addresses.length; i += batchSize) {
          const batch = addresses.slice(i, i + batchSize)
          const walletsParam = batch.join(',')

          const response = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${walletsParam}`,
            { headers: { api_key: NEYNAR_API_KEY } }
          )

          if (response.ok) {
            const data = await response.json()
            for (const [addr, users] of Object.entries(data)) {
              const userArray = users as Array<{ fid: number; username: string; display_name: string; pfp_url: string }>
              if (userArray && userArray.length > 0) {
                const user = userArray[0]
                profiles[addr.toLowerCase()] = {
                  fid: user.fid,
                  username: user.username,
                  displayName: user.display_name,
                  pfpUrl: user.pfp_url,
                }
              }
            }
          }

          // Small delay between batches to avoid rate limiting
          if (i + batchSize < addresses.length) {
            await new Promise(r => setTimeout(r, 200))
          }
        }
      } catch (err) {
        console.error('[Sync Stakers] Error fetching Farcaster profiles:', err)
      }
    }

    // Upsert stakers to database
    let activeCount = 0
    let removedCount = 0

    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i]
      const result = results[i]

      if (result.status === 'success' && result.result) {
        const stakeInfo = result.result as [bigint, bigint, bigint, number, bigint, bigint, boolean]
        const totalStaked = stakeInfo[0]

        if (totalStaked > 0n) {
          // Active staker - upsert to database
          await prisma.staker.upsert({
            where: { wallet: addr },
            create: {
              wallet: addr,
              totalStaked: totalStaked.toString(),
              flexibleAmount: stakeInfo[1].toString(),
              lockedAmount: stakeInfo[2].toString(),
              tier: stakeInfo[3],
              fid: profiles[addr]?.fid,
              username: profiles[addr]?.username,
              displayName: profiles[addr]?.displayName,
              pfpUrl: profiles[addr]?.pfpUrl,
            },
            update: {
              totalStaked: totalStaked.toString(),
              flexibleAmount: stakeInfo[1].toString(),
              lockedAmount: stakeInfo[2].toString(),
              tier: stakeInfo[3],
              fid: profiles[addr]?.fid,
              username: profiles[addr]?.username,
              displayName: profiles[addr]?.displayName,
              pfpUrl: profiles[addr]?.pfpUrl,
            },
          })
          activeCount++
        } else {
          // User unstaked completely - remove from database
          await prisma.staker.deleteMany({ where: { wallet: addr } })
          removedCount++
        }
      }
    }

    console.log(`[Sync Stakers] Synced ${activeCount} active stakers, removed ${removedCount} inactive`)

    return json({
      success: true,
      message: `Synced ${activeCount} active stakers`,
      activeCount,
      removedCount,
      totalAddressesChecked: addresses.length,
    })
  } catch (error) {
    console.error('[Sync Stakers] Error:', error)
    return json({ error: 'Failed to sync stakers' }, 500)
  }
}
