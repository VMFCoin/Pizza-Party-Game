import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, fallback, Hex } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { SHARE_AND_SPIN_ADDRESS } from '@/app/lib/constants'

export const maxDuration = 30

const RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
]

const ABI = [
  {
    inputs: [{ type: 'address', name: 'player' }, { type: 'uint256', name: 'claimedReward' }],
    name: 'recordShare',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'address', name: 'player' }, { type: 'bytes32', name: 'castHashBytes32' }],
    name: 'recordShareSpin',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'address', name: 'player' }, { type: 'uint256', name: 'entryFee' }],
    name: 'claimFreeSlice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'address', name: 'player' }],
    name: 'saveFreeSlice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'address', name: 'player' }, { type: 'uint256', name: 'entryFee' }],
    name: 'claimPendingSlice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'address', name: 'player' }, { type: 'address', name: 'recipient' }, { type: 'uint256', name: 'entryFee' }],
    name: 'giftFreeSlice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

type ShareAction = 'recordShare' | 'recordShareSpin' | 'claimFreeSlice' | 'saveFreeSlice' | 'claimPendingSlice' | 'giftFreeSlice'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action: ShareAction
      playerAddress: string
      claimedReward?: string
      castHashBytes32?: string
      entryFee?: string
      recipient?: string
    }

    const { action, playerAddress } = body

    if (!action || !playerAddress) {
      return NextResponse.json({ error: 'Missing action or playerAddress' }, { status: 400 })
    }

    const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY
    if (!privateKey) {
      return NextResponse.json({ error: 'Backend signer not configured' }, { status: 500 })
    }

    const transport = fallback(
      RPC_URLS.map(url => http(url, { timeout: 15_000 }))
    )

    const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}` as Hex)
    const walletClient = createWalletClient({ account, chain: base, transport })
    const publicClient = createPublicClient({ chain: base, transport })

    const contractAddress = SHARE_AND_SPIN_ADDRESS as `0x${string}`
    const player = playerAddress as `0x${string}`

    let hash: Hex

    switch (action) {
      case 'recordShare': {
        const reward = BigInt(body.claimedReward || '0')
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ABI,
          functionName: 'recordShare',
          args: [player, reward],
          gas: 200_000n,
        })
        break
      }
      case 'recordShareSpin': {
        const castBytes = (body.castHashBytes32 || '0x' + '0'.repeat(64)) as Hex
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ABI,
          functionName: 'recordShareSpin',
          args: [player, castBytes],
          gas: 150_000n,
        })
        break
      }
      case 'claimFreeSlice': {
        const fee = BigInt(body.entryFee || '0')
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ABI,
          functionName: 'claimFreeSlice',
          args: [player, fee],
          gas: 300_000n,
        })
        break
      }
      case 'saveFreeSlice': {
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ABI,
          functionName: 'saveFreeSlice',
          args: [player],
          gas: 100_000n,
        })
        break
      }
      case 'claimPendingSlice': {
        const fee = BigInt(body.entryFee || '0')
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ABI,
          functionName: 'claimPendingSlice',
          args: [player, fee],
          gas: 300_000n,
        })
        break
      }
      case 'giftFreeSlice': {
        const fee = BigInt(body.entryFee || '0')
        const recipient = body.recipient as `0x${string}`
        if (!recipient) {
          return NextResponse.json({ error: 'Missing recipient' }, { status: 400 })
        }
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: ABI,
          functionName: 'giftFreeSlice',
          args: [player, recipient, fee],
          gas: 300_000n,
        })
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 })

    return NextResponse.json({
      success: receipt.status === 'success',
      txHash: hash,
      action,
      player: playerAddress,
    })
  } catch (error) {
    console.error('[share/execute] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
