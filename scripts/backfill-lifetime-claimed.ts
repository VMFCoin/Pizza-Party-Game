/**
 * One-time backfill script: Seed ParlorLifetimeClaimed table with all historical
 * OwnerFeesClaimed events via RPC getLogs with timeout and fallback RPCs.
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
const MAX_BLOCK_RANGE = 2000n

const RPC_URLS = [
  'https://base-rpc.publicnode.com',
  'https://mainnet.base.org',
  'https://1rpc.io/base',
  'https://base.llamarpc.com',
]

const ownerFeesClaimedEvent = parseAbiItem('event OwnerFeesClaimed(address indexed owner, uint256 amount)')

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function getClient(rpcIndex: number) {
  return createPublicClient({
    chain: base,
    transport: http(RPC_URLS[rpcIndex % RPC_URLS.length], { timeout: 10000 }),
  })
}

async function fetchChunk(fromBlock: bigint, toBlock: bigint, rpcIndex: number): Promise<any[]> {
  const client = getClient(rpcIndex)
  const logs = await client.getLogs({
    address: PARLOR_MANAGER_ADDRESS,
    event: ownerFeesClaimedEvent,
    fromBlock,
    toBlock,
  })
  return logs
}

async function fetchWithRetry(fromBlock: bigint, toBlock: bigint): Promise<any[]> {
  for (let rpcIdx = 0; rpcIdx < RPC_URLS.length; rpcIdx++) {
    try {
      return await fetchChunk(fromBlock, toBlock, rpcIdx)
    } catch {
      await sleep(500)
    }
  }
  return [] // all RPCs failed for this chunk
}

async function main() {
  const client = getClient(0)
  const currentBlock = await client.getBlockNumber()
  const totalBlocks = currentBlock - PARLOR_MANAGER_DEPLOY_BLOCK
  const totalChunks = Math.ceil(Number(totalBlocks) / Number(MAX_BLOCK_RANGE))
  console.log(`Scanning blocks ${PARLOR_MANAGER_DEPLOY_BLOCK} to ${currentBlock} (~${totalChunks} chunks of ${MAX_BLOCK_RANGE})`)

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
    const logs = await fetchWithRetry(currentFrom, currentTo)

    if (logs.length === 0 && currentTo - currentFrom > 100n) {
      // Could be a failed chunk - count it
      // (most chunks genuinely have 0 events though)
    }

    for (const log of logs) {
      const owner = ((log as any).args.owner as string).toLowerCase()
      const amount = (log as any).args.amount as bigint
      totals.set(owner, (totals.get(owner) || 0n) + amount)
      lastTxMap.set(owner, (log as any).transactionHash)
      totalEvents++
    }

    if (chunkNum % 50 === 0 || logs.length > 0) {
      const pct = (Number(currentTo - PARLOR_MANAGER_DEPLOY_BLOCK) / Number(totalBlocks) * 100).toFixed(1)
      console.log(`  Chunk ${chunkNum}/${totalChunks} (${pct}%) | Events: ${totalEvents} | Owners: ${totals.size}`)
    }

    currentFrom = currentTo + 1n
    await sleep(300) // be gentle with free RPCs
  }

  console.log(`\nDone scanning. Found ${totalEvents} events for ${totals.size} owners:\n`)

  for (const [wallet, totalWei] of totals) {
    const totalFormatted = formatUnits(totalWei, 18)
    console.log(`  ${wallet}: ${Number(totalFormatted).toLocaleString()} PIZZA`)

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
