/**
 * Find Wallet Addresses for Whitelisted FIDs
 *
 * This script queries the blockchain to find existing stakers and attempts
 * to correlate them with known FIDs via Farcaster profiles.
 *
 * Usage: npx tsx scripts/find-staker-wallets.ts
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { base } from 'viem/chains'

// Staking contract
const STAKING_ADDRESS = '0xCbAf5bACe5419710C3852653d3DdEB831d7415be' as const

// Whitelisted FIDs
const STAKING_WHITELIST_FIDS = [1013491, 1060809, 963422, 392134, 200506]

// Known players from game history (from pre-migration snapshot)
const KNOWN_PLAYERS = [
  '0x9157Feb12812b253e84447C6B52C38651fd67FcA',
  '0xdf13d712d58EF7F7Abd4D29B398d503262ba4AC0',
  '0xffde42d40175b3b9349Dfb384439dCB811691E09',
  '0xD68C5493e41F03faC90776ad0366376E245255E8',
  '0xC77dA8cB158BA77BaC765625745a766Af3111A69',
  '0x65e3419E633833Df1D602e7905Cb9C7e541f0849',
  '0x598986FaC0D3ff7EaC3D55fFAB5e67c2a27C2765',
  '0x257Cbe89968495C3aE8C81BccB8BE7f257CD5f66',
  '0xBc4340Af8B93b0260ec8052CFA50982dD0865ba7',
  '0x1B49689db12080f5FcC5DC36f990599739487566',
  '0x8B06bd80840F0c6Ed78Aa8c3cc1d8eC155118d12',
  '0xF0F950DfF685f166F2531fbCf97CebEa000ef3B8',
  '0xd1CB812192C535d2762Bf4AD1f1C1D4deE3e383e',
  '0x14E8FddFa4a7c709C19a8C7DA5205c3ae366355c',
  '0xc64c699514E74451a627ccE93D45dc2E8f3a7793',
  '0xf091E8c19D1F5F3D44D0D3311001Af1437B4F5B8',
]

// Staking ABI (minimal)
const STAKING_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getTotalStaked',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'flexibleStakes',
    outputs: [
      { name: 'stakedAmount', type: 'uint256' },
      { name: 'stakeTimestamp', type: 'uint256' },
      { name: 'lockEndTimestamp', type: 'uint256' },
      { name: 'lastClaimTimestamp', type: 'uint256' },
      { name: 'rewardDebt', type: 'uint256' },
      { name: 'lastToppingClaimWeek', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'lockedStakes',
    outputs: [
      { name: 'stakedAmount', type: 'uint256' },
      { name: 'stakeTimestamp', type: 'uint256' },
      { name: 'lockEndTimestamp', type: 'uint256' },
      { name: 'lastClaimTimestamp', type: 'uint256' },
      { name: 'rewardDebt', type: 'uint256' },
      { name: 'lastToppingClaimWeek', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'stakerCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const client = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

async function getFarcasterProfile(address: string): Promise<{ fid: number; username: string } | null> {
  try {
    // Query Neynar API for Farcaster user by verified address
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
      {
        headers: {
          'api_key': process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS',
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    const users = data[address.toLowerCase()]

    if (users && users.length > 0) {
      return {
        fid: users[0].fid,
        username: users[0].username,
      }
    }

    return null
  } catch (error) {
    return null
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('FINDING WALLET ADDRESSES FOR WHITELISTED FIDS')
  console.log('='.repeat(60))
  console.log('')

  // Get staker count
  const stakerCount = await client.readContract({
    address: STAKING_ADDRESS,
    abi: STAKING_ABI,
    functionName: 'stakerCount',
  })

  console.log(`Current staker count: ${stakerCount}`)
  console.log('')

  // Check known players for staking positions
  console.log('Checking known players for staking positions...')
  console.log('-'.repeat(60))

  const stakers: { wallet: string; staked: bigint; fid?: number; username?: string }[] = []

  for (const player of KNOWN_PLAYERS) {
    const totalStaked = await client.readContract({
      address: STAKING_ADDRESS,
      abi: STAKING_ABI,
      functionName: 'getTotalStaked',
      args: [player as `0x${string}`],
    })

    if (totalStaked > 0n) {
      stakers.push({ wallet: player, staked: totalStaked })
      console.log(`  ${player}: ${formatUnits(totalStaked, 18)} PIZZA staked`)
    }
  }

  console.log('')
  console.log(`Found ${stakers.length} stakers from known players`)
  console.log('')

  // Try to get Farcaster profiles for stakers
  console.log('Looking up Farcaster profiles for stakers...')
  console.log('-'.repeat(60))

  const fidWalletMap: Record<number, string> = {}

  for (const staker of stakers) {
    const profile = await getFarcasterProfile(staker.wallet)
    if (profile) {
      staker.fid = profile.fid
      staker.username = profile.username
      fidWalletMap[profile.fid] = staker.wallet
      console.log(`  ${staker.wallet}: FID ${profile.fid} (@${profile.username})`)
    } else {
      console.log(`  ${staker.wallet}: No Farcaster profile found`)
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('WHITELISTED FID STATUS')
  console.log('='.repeat(60))
  console.log('')

  for (const fid of STAKING_WHITELIST_FIDS) {
    if (fidWalletMap[fid]) {
      console.log(`  FID ${fid}: ${fidWalletMap[fid]} ✓`)
    } else {
      console.log(`  FID ${fid}: NOT FOUND ✗`)
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('SOLIDITY CODE FOR RegisterFidWalletPairs.s.sol')
  console.log('='.repeat(60))
  console.log('')

  let idx = 0
  for (const fid of STAKING_WHITELIST_FIDS) {
    const wallet = fidWalletMap[fid]
    console.log(`// FID ${fid}`)
    console.log(`fids[${idx}] = ${fid};`)
    if (wallet) {
      console.log(`wallets[${idx}] = ${wallet};`)
    } else {
      console.log(`wallets[${idx}] = address(0); // TODO: Get wallet for FID ${fid}`)
    }
    console.log('')
    idx++
  }
}

main().catch(console.error)
