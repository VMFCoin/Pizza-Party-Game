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

    console.log('[share/execute] Request:', { action, playerAddress, claimedReward: body.claimedReward, castHash: body.castHashBytes32?.slice(0, 20) })

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

    // Build the call args for the requested action
    let functionName: string
    let args: readonly unknown[]

    switch (action) {
      case 'recordShare':
        functionName = 'recordShare'
        args = [player, BigInt(body.claimedReward || '0')]
        break
      case 'recordShareSpin':
        functionName = 'recordShareSpin'
        args = [player, (body.castHashBytes32 || '0x' + '0'.repeat(64)) as Hex]
        break
      case 'claimFreeSlice':
        functionName = 'claimFreeSlice'
        args = [player, BigInt(body.entryFee || '0')]
        break
      case 'saveFreeSlice':
        functionName = 'saveFreeSlice'
        args = [player]
        break
      case 'claimPendingSlice':
        functionName = 'claimPendingSlice'
        args = [player, BigInt(body.entryFee || '0')]
        break
      case 'giftFreeSlice': {
        const recipient = body.recipient as `0x${string}`
        if (!recipient) {
          return NextResponse.json({ error: 'Missing recipient' }, { status: 400 })
        }
        functionName = 'giftFreeSlice'
        args = [player, recipient, BigInt(body.entryFee || '0')]
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // Simulate first — this surfaces the contract revert reason cleanly
    // (e.g. "Share: already shared this game") BEFORE spending gas on a tx
    // that would just fail on-chain.
    try {
      await publicClient.simulateContract({
        address: contractAddress,
        abi: ABI,
        functionName: functionName as never,
        args: args as never,
        account,
      })
    } catch (simErr) {
      const raw = simErr instanceof Error ? simErr.message : 'Simulation failed'
      const reason = parseRevertReason(raw)
      console.log('[share/execute] Simulation reverted:', { action, reason })
      return NextResponse.json({ success: false, error: reason, action }, { status: 200 })
    }

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: ABI,
      functionName: functionName as never,
      args: args as never,
      gas: 500_000n,
    })

    console.log('[share/execute] TX submitted:', hash)

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 })
    console.log('[share/execute] TX result:', { status: receipt.status, gasUsed: receipt.gasUsed.toString() })

    return NextResponse.json({
      success: receipt.status === 'success',
      txHash: hash,
      action,
      player: playerAddress,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[share/execute] FAILED:', { message, stack: error instanceof Error ? error.stack?.slice(0, 300) : '' })
    return NextResponse.json({ error: parseRevertReason(message) }, { status: 500 })
  }
}

// Map raw viem revert text to a clean, user-friendly reason.
function parseRevertReason(raw: string): string {
  // viem embeds the require string after "reverted with the following reason:"
  const m = raw.match(/reason:\s*\n?\s*([^\n]+)/i)
  const reason = (m?.[1] || raw).trim()

  if (reason.includes('already shared this game')) return 'You already shared this game. Come back next game!'
  if (reason.includes('weekly limit'))             return 'You hit the 3-shares-per-week limit. Resets Monday.'
  if (reason.includes('reward too high'))          return 'Reward amount out of range. Try again shortly.'
  if (reason.includes('reward not set'))           return 'Share rewards are being configured. Try again soon.'
  if (reason.includes('no free slice'))            return 'No free slice available to claim.'
  if (reason.includes('slice expired'))            return 'Your free slice expired (48 hr window).'
  if (reason.includes('No pending slice'))         return 'No saved free slice to claim.'
  if (reason.includes('fee too high'))             return 'Entry fee out of range. Try again shortly.'
  if (reason.includes('Pausable') || reason.includes('paused')) return 'Share & Spin is temporarily paused.'
  if (reason.includes('cast used'))                return 'This cast was already used. Share a new one.'
  if (reason.includes('share first'))              return 'Please share again, then verify immediately.'
  return 'Something went wrong. Please try again.'
}
