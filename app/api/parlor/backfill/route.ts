import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { prisma } from '@/app/lib/db'
import { PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds

const PARLOR_MANAGER_DEPLOY_BLOCK = 39521243n
const MAX_BLOCK_RANGE = 5000n

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com', { timeout: 10000 }),
})

const ownerFeesClaimedEvent = parseAbiItem('event OwnerFeesClaimed(address indexed owner, uint256 amount)')

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(request: Request) {
  // Simple auth check
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const currentBlock = await publicClient.getBlockNumber()
    const totals = new Map<string, bigint>()
    const lastTxMap = new Map<string, string>()
    let currentFrom = PARLOR_MANAGER_DEPLOY_BLOCK
    let totalEvents = 0
    let failedChunks = 0

    while (currentFrom <= currentBlock) {
      const currentTo = currentFrom + MAX_BLOCK_RANGE > currentBlock
        ? currentBlock
        : currentFrom + MAX_BLOCK_RANGE

      try {
        const logs = await publicClient.getLogs({
          address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
          event: ownerFeesClaimedEvent,
          fromBlock: currentFrom,
          toBlock: currentTo,
        })

        for (const log of logs) {
          const owner = (log.args.owner as string).toLowerCase()
          const amount = log.args.amount as bigint
          totals.set(owner, (totals.get(owner) || 0n) + amount)
          lastTxMap.set(owner, log.transactionHash)
          totalEvents++
        }
      } catch {
        failedChunks++
      }

      currentFrom = currentTo + 1n
      await sleep(100)
    }

    // Write to database
    const results: Record<string, string> = {}
    for (const [wallet, totalWei] of totals) {
      await prisma.parlorLifetimeClaimed.upsert({
        where: { wallet },
        update: {
          totalClaimed: totalWei.toString(),
          lastClaimTxHash: lastTxMap.get(wallet) || null,
        },
        create: {
          wallet,
          totalClaimed: totalWei.toString(),
          lastClaimTxHash: lastTxMap.get(wallet) || null,
        },
      })
      results[wallet] = formatUnits(totalWei, 18)
    }

    return NextResponse.json({
      success: true,
      totalEvents,
      owners: totals.size,
      failedChunks,
      results,
    })
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 }
    )
  }
}
