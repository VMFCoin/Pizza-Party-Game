/**
 * One-time backfill: Seed ParlorLifetimeClaimed from OwnerFeesClaimed events.
 * Uses 10K block chunks with 1.5s delay to stay under RPC rate limits.
 * ~260 chunks * 1.5s ≈ ~6.5 minutes.
 *
 * Usage: npx tsx scripts/backfill-lifetime-claimed.ts
 */
import { PrismaClient } from '@prisma/client'
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
import { base } from 'viem/chains'
import dotenv from 'dotenv'

dotenv.config({ override: true })

const prisma = new PrismaClient()
const PARLOR_MANAGER_ADDRESS = '0x7acfaa1dadd836404a8d90b49581758c4fdc889b' as const
const PARLOR_MANAGER_DEPLOY_BLOCK = 39521243n
const MAX_BLOCK_RANGE = 10000n
const DELAY_MS = 1500

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base.drpc.org', { timeout: 15000 }),
})

const ownerFeesClaimedEvent = parseAbiItem('event OwnerFeesClaimed(address indexed owner, uint256 amount)')

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const currentBlock = await publicClient.getBlockNumber()
  const totalBlocks = currentBlock - PARLOR_MANAGER_DEPLOY_BLOCK
  const totalChunks = Math.ceil(Number(totalBlocks) / Number(MAX_BLOCK_RANGE))
  console.log(`Scanning ${totalBlocks} blocks in ~${totalChunks} chunks (${DELAY_MS}ms delay)\n`)

  const totals = new Map<string, bigint>()
  const lastTxMap = new Map<string, string>()
  let currentFrom = PARLOR_MANAGER_DEPLOY_BLOCK
  let chunkNum = 0
  let totalEvents = 0
  let failedChunks = 0

  while (currentFrom <= currentBlock) {
    const currentTo = currentFrom + MAX_BLOCK_RANGE > currentBlock
      ? currentBlock
      : currentFrom + MAX_BLOCK_RANGE

    chunkNum++

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const logs = await publicClient.getLogs({
          address: PARLOR_MANAGER_ADDRESS,
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
        break // success
      } catch {
        if (attempt === 2) {
          failedChunks++
          console.log(`  FAILED chunk ${chunkNum} (${currentFrom}-${currentTo})`)
        }
        await sleep(3000) // extra wait on retry
      }
    }

    if (chunkNum % 25 === 0) {
      const pct = (Number(currentTo - PARLOR_MANAGER_DEPLOY_BLOCK) / Number(totalBlocks) * 100).toFixed(1)
      console.log(`  ${pct}% (chunk ${chunkNum}/${totalChunks}) | Events: ${totalEvents} | Owners: ${totals.size}`)
    }

    currentFrom = currentTo + 1n
    await sleep(DELAY_MS)
  }

  console.log(`\nScan complete: ${totalEvents} events, ${totals.size} owners, ${failedChunks} failed chunks\n`)

  for (const [wallet, totalWei] of totals) {
    const formatted = formatUnits(totalWei, 18)
    console.log(`  ${wallet}: ${Number(formatted).toLocaleString()} PIZZA`)

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
  }

  console.log('\nBackfill complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
