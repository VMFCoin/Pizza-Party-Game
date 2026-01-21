/**
 * Get Wallet Addresses for Whitelisted FIDs from Staker Cache
 *
 * This script queries the Staker table (which caches Farcaster profile data)
 * to find wallet addresses for whitelisted FIDs.
 *
 * Usage: npx tsx scripts/get-fid-wallets-from-stakers.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Whitelisted FIDs
const STAKING_WHITELIST_FIDS = [1013491, 1060809, 963422, 392134, 200506]

async function main() {
  console.log('='.repeat(60))
  console.log('FETCHING WALLET ADDRESSES FOR WHITELISTED FIDS')
  console.log('='.repeat(60))
  console.log('')

  // Query Staker table for whitelisted FIDs
  const stakers = await prisma.staker.findMany({
    where: {
      fid: {
        in: STAKING_WHITELIST_FIDS
      }
    }
  })

  console.log(`Found ${stakers.length} stakers with whitelisted FIDs in cache`)
  console.log('')

  if (stakers.length > 0) {
    console.log('Cached stakers:')
    for (const staker of stakers) {
      console.log(`  FID ${staker.fid} (@${staker.username}): ${staker.wallet}`)
    }
    console.log('')
  }

  // Also get all stakers to see who's actually staking
  const allStakers = await prisma.staker.findMany({
    orderBy: { totalStaked: 'desc' }
  })

  console.log(`Total stakers in cache: ${allStakers.length}`)
  console.log('')

  if (allStakers.length > 0) {
    console.log('All cached stakers:')
    for (const staker of allStakers) {
      const isWhitelisted = staker.fid && STAKING_WHITELIST_FIDS.includes(staker.fid)
      const marker = isWhitelisted ? ' ✓ WHITELISTED' : ''
      console.log(`  ${staker.wallet} - FID ${staker.fid || 'N/A'} (@${staker.username || 'unknown'})${marker}`)
    }
  }

  // Build the FID-wallet mapping
  const fidWalletMap: Record<number, { wallet: string; username: string }> = {}

  for (const staker of stakers) {
    if (staker.fid) {
      fidWalletMap[staker.fid] = {
        wallet: staker.wallet,
        username: staker.username || 'unknown'
      }
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('WHITELISTED FID STATUS')
  console.log('='.repeat(60))
  console.log('')

  const foundPairs: { fid: number; wallet: string; username: string }[] = []
  const missingFids: number[] = []

  for (const fid of STAKING_WHITELIST_FIDS) {
    if (fidWalletMap[fid]) {
      const { wallet, username } = fidWalletMap[fid]
      console.log(`  FID ${fid} (@${username}): ${wallet} ✓`)
      foundPairs.push({ fid, wallet, username })
    } else {
      console.log(`  FID ${fid}: NOT FOUND ✗`)
      missingFids.push(fid)
    }
  }

  if (foundPairs.length > 0) {
    console.log('')
    console.log('='.repeat(60))
    console.log('SOLIDITY CODE FOR RegisterFidWalletPairs.s.sol')
    console.log('='.repeat(60))
    console.log('')
    console.log('// Copy this into RegisterFidWalletPairs.s.sol:')
    console.log('')
    console.log(`uint256[] memory fids = new uint256[](${foundPairs.length});`)
    console.log(`address[] memory wallets = new address[](${foundPairs.length});`)
    console.log('')

    foundPairs.forEach((pair, idx) => {
      console.log(`// FID ${pair.fid} (@${pair.username})`)
      console.log(`fids[${idx}] = ${pair.fid};`)
      console.log(`wallets[${idx}] = ${pair.wallet};`)
      console.log('')
    })
  }

  if (missingFids.length > 0) {
    console.log('')
    console.log('WARNING: Missing wallet addresses for FIDs:', missingFids.join(', '))
    console.log('These users need to be manually added or fetch from Farcaster API.')
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
