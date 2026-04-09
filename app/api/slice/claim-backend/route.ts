import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, fallback, Hex } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { PARLOR_MANAGER_ADDRESS } from '@/app/lib/constants'

export const maxDuration = 30

const RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
]

const ABI = [
  {
    inputs: [{ type: 'address', name: 'player' }, { type: 'uint256', name: 'entryFeeAmount' }],
    name: 'claimSlice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export async function POST(req: NextRequest) {
  try {
    const { playerAddress, entryFeeAmount } = await req.json() as {
      playerAddress: string
      entryFeeAmount: string
    }

    if (!playerAddress || !entryFeeAmount) {
      return NextResponse.json({ error: 'Missing playerAddress or entryFeeAmount' }, { status: 400 })
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

    const hash = await walletClient.writeContract({
      address: PARLOR_MANAGER_ADDRESS as `0x${string}`,
      abi: ABI,
      functionName: 'claimSlice',
      args: [playerAddress as `0x${string}`, BigInt(entryFeeAmount)],
      gas: 300_000n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 })

    return NextResponse.json({
      success: receipt.status === 'success',
      txHash: hash,
      player: playerAddress,
    })
  } catch (error) {
    console.error('[slice/claim-backend] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
