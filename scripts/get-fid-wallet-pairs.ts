/**
 * Get FID-Wallet Pairs from Database
 *
 * This script queries the StakingPosition table to get all existing FID-wallet mappings
 * that need to be registered on-chain.
 *
 * Usage: npx ts-node scripts/get-fid-wallet-pairs.ts
 * Or: npx tsx scripts/get-fid-wallet-pairs.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Whitelisted FIDs (from the codebase)
const STAKING_WHITELIST_FIDS = [1013491, 1060809, 963422, 392134, 200506]

async function main() {
  console.log('='.repeat(60))
  console.log('FID-WALLET PAIRS FOR ON-CHAIN REGISTRATION')
  console.log('='.repeat(60))
  console.log('')

  // Query all staking positions
  const positions = await prisma.stakingPosition.findMany({
    orderBy: { fid: 'asc' }
  })

  console.log(`Found ${positions.length} staking positions in database`)
  console.log('')

  if (positions.length === 0) {
    console.log('No staking positions found.')
    console.log('')
    console.log('Whitelisted FIDs that need wallet addresses:')
    for (const fid of STAKING_WHITELIST_FIDS) {
      console.log(`  FID ${fid}: (no wallet registered)`)
    }
    console.log('')
    console.log('You need to get wallet addresses from the users directly.')
    return
  }

  console.log('Existing FID-Wallet Pairs:')
  console.log('-'.repeat(60))

  const fidWalletMap: Record<number, string> = {}

  for (const pos of positions) {
    console.log(`  FID ${pos.fid} -> ${pos.wallet}`)
    fidWalletMap[pos.fid] = pos.wallet
  }

  console.log('')
  console.log('Whitelisted FIDs status:')
  console.log('-'.repeat(60))

  const registeredFids: number[] = []
  const missingFids: number[] = []

  for (const fid of STAKING_WHITELIST_FIDS) {
    if (fidWalletMap[fid]) {
      console.log(`  FID ${fid}: ${fidWalletMap[fid]} ✓`)
      registeredFids.push(fid)
    } else {
      console.log(`  FID ${fid}: NOT REGISTERED ✗`)
      missingFids.push(fid)
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('SOLIDITY CODE FOR RegisterFidWalletPairs.s.sol')
  console.log('='.repeat(60))
  console.log('')

  // Generate Solidity code
  console.log('// Copy this into RegisterFidWalletPairs.s.sol:')
  console.log('')

  let idx = 0
  for (const fid of STAKING_WHITELIST_FIDS) {
    const wallet = fidWalletMap[fid]
    if (wallet) {
      console.log(`fids[${idx}] = ${fid};`)
      console.log(`wallets[${idx}] = ${wallet};`)
    } else {
      console.log(`fids[${idx}] = ${fid};`)
      console.log(`wallets[${idx}] = address(0); // TODO: Get wallet for FID ${fid}`)
    }
    console.log('')
    idx++
  }

  if (missingFids.length > 0) {
    console.log('')
    console.log('WARNING: The following whitelisted FIDs have no wallet registered:')
    for (const fid of missingFids) {
      console.log(`  - FID ${fid}`)
    }
    console.log('')
    console.log('You need to get their wallet addresses before they can stake.')
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
