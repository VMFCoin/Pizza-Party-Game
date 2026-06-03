/**
 * One-time backfill: replay legacy Neon `StickerFind` rows onto the
 * on-chain `StickerRegistryUpgradeable` contract via the backend signer.
 *
 * Why: the sticker feature was migrated to be fully on-chain. The old
 * DB rows were never written on-chain; this script ports them so they
 * appear in the map / leaderboard alongside new finds.
 *
 * Skips:
 *   - rows without a finderAddress (anonymous DB entries can't be
 *     attributed on-chain; address is required by recordFindFor)
 *   - rows that look like duplicates of already-on-chain finds
 *     (same finder + lat/lng within ~11m + same timestamp ±5 min)
 *
 * Usage:
 *   DRY RUN first:  npx tsx scripts/backfill-sticker-finds.ts
 *   COMMIT:         BACKFILL_COMMIT=1 npx tsx scripts/backfill-sticker-finds.ts
 */
import { PrismaClient } from '@prisma/client'
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Hex,
} from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import dotenv from 'dotenv'

dotenv.config({ override: true })

const PROXY = '0xba3e4db29efd1d6499B70fe672Fb08FC9B62FeDD' as const
const RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
]
const DELAY_MS = 1500
const COMMIT = process.env.BACKFILL_COMMIT === '1'
const DUPLICATE_COORD_TOLERANCE = 100 // 1e6-scaled int diff (≈ 11 cm at the equator)
const DUPLICATE_TIME_TOLERANCE_S = 300

const ABI = [
  {
    name: 'recordFindFor',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_player', type: 'address' },
      { name: '_latitude', type: 'int256' },
      { name: '_longitude', type: 'int256' },
      { name: '_city', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'totalFinds',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getRecentFinds',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_offset', type: 'uint256' },
      { name: '_limit', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'records',
        type: 'tuple[]',
        components: [
          { name: 'finder', type: 'address' },
          { name: 'latitude', type: 'int256' },
          { name: 'longitude', type: 'int256' },
          { name: 'city', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'backendSigner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function scale(coord: number): bigint {
  return BigInt(Math.round(coord * 1_000_000))
}

type DbFind = {
  id: string
  latitude: number
  longitude: number
  city: string | null
  finderAddress: string | null
  createdAt: Date
}

type ChainFind = {
  finder: string
  latScaled: bigint
  lngScaled: bigint
  timestamp: bigint
}

function isDuplicate(row: DbFind, chain: ChainFind[]): boolean {
  if (!row.finderAddress) return false
  const finder = row.finderAddress.toLowerCase()
  const lat = scale(row.latitude)
  const lng = scale(row.longitude)
  const ts = BigInt(Math.floor(row.createdAt.getTime() / 1000))
  for (const c of chain) {
    if (c.finder.toLowerCase() !== finder) continue
    const latDiff = c.latScaled > lat ? c.latScaled - lat : lat - c.latScaled
    const lngDiff = c.lngScaled > lng ? c.lngScaled - lng : lng - c.lngScaled
    if (latDiff > BigInt(DUPLICATE_COORD_TOLERANCE)) continue
    if (lngDiff > BigInt(DUPLICATE_COORD_TOLERANCE)) continue
    const tDiff = c.timestamp > ts ? c.timestamp - ts : ts - c.timestamp
    if (tDiff > BigInt(DUPLICATE_TIME_TOLERANCE_S)) continue
    return true
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllOnChainFinds(client: any): Promise<ChainFind[]> {
  const total = Number(await client.readContract({
    address: PROXY,
    abi: ABI,
    functionName: 'totalFinds',
  }))
  if (total === 0) return []
  const batch = 50
  const out: ChainFind[] = []
  for (let off = 0; off < total; off += batch) {
    const lim = Math.min(batch, total - off)
    const recs = await client.readContract({
      address: PROXY,
      abi: ABI,
      functionName: 'getRecentFinds',
      args: [BigInt(off), BigInt(lim)],
    }) as Array<{ finder: string; latitude: bigint; longitude: bigint; city: string; timestamp: bigint }>
    for (const r of recs) {
      out.push({
        finder: r.finder,
        latScaled: r.latitude,
        lngScaled: r.longitude,
        timestamp: r.timestamp,
      })
    }
  }
  return out
}

async function main() {
  const pk = process.env.BACKEND_SIGNER_PRIVATE_KEY
  if (!pk) throw new Error('BACKEND_SIGNER_PRIVATE_KEY missing from .env')

  const transport = fallback(RPC_URLS.map(u => http(u, { timeout: 15_000 })))
  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, '')}` as Hex)
  const publicClient = createPublicClient({ chain: base, transport })
  const walletClient = createWalletClient({ account, chain: base, transport })

  const signerOnChain = await publicClient.readContract({
    address: PROXY,
    abi: ABI,
    functionName: 'backendSigner',
  }) as `0x${string}`
  if (signerOnChain.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Backend signer mismatch — chain: ${signerOnChain}, .env key: ${account.address}`)
  }

  console.log(`Mode:        ${COMMIT ? 'COMMIT' : 'DRY RUN'}`)
  console.log(`Proxy:       ${PROXY}`)
  console.log(`Signer:      ${account.address}\n`)

  const prisma = new PrismaClient()
  const rows = await prisma.stickerFind.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      city: true,
      finderAddress: true,
      createdAt: true,
    },
  })
  await prisma.$disconnect()
  console.log(`DB rows total: ${rows.length}`)

  const onChain = await fetchAllOnChainFinds(publicClient)
  console.log(`On-chain finds before backfill: ${onChain.length}\n`)

  const eligible: DbFind[] = []
  let skippedAnon = 0
  let skippedDup = 0
  for (const r of rows) {
    if (!r.finderAddress || !/^0x[a-fA-F0-9]{40}$/.test(r.finderAddress)) {
      skippedAnon++
      continue
    }
    if (isDuplicate(r as DbFind, onChain)) {
      skippedDup++
      continue
    }
    eligible.push(r as DbFind)
  }

  console.log(`Skipped (no wallet address): ${skippedAnon}`)
  console.log(`Skipped (already on-chain):  ${skippedDup}`)
  console.log(`To backfill:                 ${eligible.length}\n`)

  if (eligible.length === 0) {
    console.log('Nothing to do.')
    return
  }

  if (!COMMIT) {
    console.log('Preview of first 10:')
    for (const r of eligible.slice(0, 10)) {
      console.log(`  ${r.createdAt.toISOString()}  ${r.finderAddress}  (${r.latitude}, ${r.longitude})  ${r.city ?? '—'}`)
    }
    console.log('\nDry run only. Re-run with BACKFILL_COMMIT=1 to write on-chain.')
    return
  }

  let success = 0
  let failed = 0
  for (let i = 0; i < eligible.length; i++) {
    const row = eligible[i]
    const player = row.finderAddress as `0x${string}`
    const latScaled = scale(row.latitude)
    const lngScaled = scale(row.longitude)
    const city = (row.city ?? 'Unknown').slice(0, 64)

    try {
      const hash = await walletClient.writeContract({
        address: PROXY,
        abi: ABI,
        functionName: 'recordFindFor',
        args: [player, latScaled, lngScaled, city],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'success') {
        success++
        console.log(`[${i + 1}/${eligible.length}] OK  ${player}  ${city}  tx=${hash}`)
      } else {
        failed++
        console.log(`[${i + 1}/${eligible.length}] REVERT  ${player}  tx=${hash}`)
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[${i + 1}/${eligible.length}] ERR  ${player}  ${msg.slice(0, 200)}`)
    }
    await sleep(DELAY_MS)
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
