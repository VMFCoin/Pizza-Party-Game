/**
 * Get Wallet Addresses for Whitelisted FIDs from Farcaster
 *
 * This script queries the Neynar API to get verified wallet addresses
 * for each whitelisted FID, then outputs the Solidity code for the
 * RegisterFidWalletPairs script.
 *
 * Usage: npx tsx scripts/get-fid-wallets-from-farcaster.ts
 */

// Whitelisted FIDs
const STAKING_WHITELIST_FIDS = [1013491, 1060809, 963422, 392134, 200506]

interface FarcasterUser {
  fid: number
  username: string
  display_name: string
  verified_addresses: {
    eth_addresses: string[]
  }
}

async function getFarcasterUserByFid(fid: number): Promise<FarcasterUser | null> {
  try {
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          'api_key': process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS',
        },
      }
    )

    if (!response.ok) {
      console.error(`  API error for FID ${fid}: ${response.status}`)
      return null
    }

    const data = await response.json()

    if (data.users && data.users.length > 0) {
      return data.users[0]
    }

    return null
  } catch (error) {
    console.error(`  Error fetching FID ${fid}:`, error)
    return null
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('FETCHING WALLET ADDRESSES FOR WHITELISTED FIDS')
  console.log('='.repeat(60))
  console.log('')

  const fidWalletPairs: { fid: number; wallet: string; username: string }[] = []
  const missingFids: number[] = []

  for (const fid of STAKING_WHITELIST_FIDS) {
    console.log(`Fetching FID ${fid}...`)

    const user = await getFarcasterUserByFid(fid)

    if (user) {
      const ethAddresses = user.verified_addresses?.eth_addresses || []

      if (ethAddresses.length > 0) {
        // Use the first verified address
        const wallet = ethAddresses[0]
        fidWalletPairs.push({ fid, wallet, username: user.username })
        console.log(`  ✓ FID ${fid} (@${user.username}): ${wallet}`)

        if (ethAddresses.length > 1) {
          console.log(`    (${ethAddresses.length} verified addresses, using first)`)
        }
      } else {
        console.log(`  ✗ FID ${fid} (@${user.username}): No verified ETH addresses`)
        missingFids.push(fid)
      }
    } else {
      console.log(`  ✗ FID ${fid}: User not found`)
      missingFids.push(fid)
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log('')
  console.log(`Found wallets for ${fidWalletPairs.length}/${STAKING_WHITELIST_FIDS.length} FIDs`)

  if (missingFids.length > 0) {
    console.log(`Missing wallets for FIDs: ${missingFids.join(', ')}`)
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('SOLIDITY CODE FOR RegisterFidWalletPairs.s.sol')
  console.log('='.repeat(60))
  console.log('')
  console.log('// Copy this into RegisterFidWalletPairs.s.sol:')
  console.log('')
  console.log(`uint256[] memory fids = new uint256[](${fidWalletPairs.length});`)
  console.log(`address[] memory wallets = new address[](${fidWalletPairs.length});`)
  console.log('')

  fidWalletPairs.forEach((pair, idx) => {
    console.log(`// FID ${pair.fid} (@${pair.username})`)
    console.log(`fids[${idx}] = ${pair.fid};`)
    console.log(`wallets[${idx}] = ${pair.wallet};`)
    console.log('')
  })

  // Also output JSON for easy use
  console.log('')
  console.log('='.repeat(60))
  console.log('JSON FORMAT')
  console.log('='.repeat(60))
  console.log('')
  console.log(JSON.stringify(fidWalletPairs, null, 2))
}

main().catch(console.error)
