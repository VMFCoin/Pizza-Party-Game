import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem, fallback } from 'viem'
import { base } from 'viem/chains'
import { prisma } from '@/app/lib/db'
import { PIZZA_CHAT_ADDRESS } from '@/app/lib/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Fallback RPCs for reliability
const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://mainnet.base.org', { timeout: 15_000 }),
    http('https://base.publicnode.com', { timeout: 15_000 }),
    http('https://base.meowrpc.com', { timeout: 15_000 }),
  ]),
})

const MESSAGE_POSTED_EVENT = parseAbiItem(
  'event MessagePosted(uint256 indexed roomId, uint256 indexed messageId, address indexed sender, uint256 pizzaFeePaid, uint256 timestamp, bytes32 replyToHash, string message)'
)

/**
 * POST /api/chat/index-events
 * Indexes new MessagePosted events from the PizzaChat contract.
 * Called by cron or after a user posts a message.
 * Auth: x-admin-key header or x-vercel-cron header
 */
export async function POST(_request: NextRequest) {
  // Skip if contract not deployed yet
  if ((PIZZA_CHAT_ADDRESS as string) === ZERO_ADDRESS) {
    return NextResponse.json({ success: false, error: 'Chat contract not deployed yet' }, { status: 503 })
  }

  try {
    // Find the latest indexed block
    const latest = await prisma.chatMessage.findFirst({
      orderBy: { blockNumber: 'desc' },
      select: { blockNumber: true },
    })

    const fromBlock = latest?.blockNumber
      ? BigInt(latest.blockNumber.toString()) + 1n
      : 0n // Start from beginning if no messages indexed

    const currentBlock = await client.getBlockNumber()

    // Don't fetch more than 10000 blocks at a time
    const toBlock = fromBlock + 10000n > currentBlock ? currentBlock : fromBlock + 10000n

    if (fromBlock > toBlock) {
      return NextResponse.json({ success: true, indexed: 0, message: 'Already up to date' })
    }

    const logs = await client.getLogs({
      address: PIZZA_CHAT_ADDRESS as `0x${string}`,
      event: MESSAGE_POSTED_EVENT,
      fromBlock,
      toBlock,
    })

    let indexed = 0

    for (const log of logs) {
      const { roomId, messageId, sender, pizzaFeePaid, timestamp, replyToHash, message } = log.args as {
        roomId: bigint
        messageId: bigint
        sender: `0x${string}`
        pizzaFeePaid: bigint
        timestamp: bigint
        replyToHash: `0x${string}`
        message: string
      }

      // Resolve Farcaster profile for sender
      let senderName: string | null = null
      let senderFid: number | null = null
      let senderPfp: string | null = null

      try {
        const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY
        if (neynarKey) {
          const res = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${sender}`,
            { headers: { api_key: neynarKey } }
          )
          if (res.ok) {
            const data = await res.json()
            const userData = data[sender.toLowerCase()]
            if (userData && userData.length > 0) {
              senderFid = userData[0].fid
              senderName = userData[0].display_name || userData[0].username
              senderPfp = userData[0].pfp_url
            }
          }
        }
      } catch {
        // Profile resolution is best-effort
      }

      const replyHash = replyToHash === '0x0000000000000000000000000000000000000000000000000000000000000000'
        ? null
        : replyToHash

      await prisma.chatMessage.upsert({
        where: {
          roomId_messageId: {
            roomId: Number(roomId),
            messageId: Number(messageId),
          },
        },
        create: {
          roomId: Number(roomId),
          messageId: Number(messageId),
          senderAddress: sender.toLowerCase(),
          senderFid,
          senderName,
          senderPfp,
          message,
          pizzaFeePaid: pizzaFeePaid.toString(),
          replyToHash: replyHash,
          onchainTs: new Date(Number(timestamp) * 1000),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        },
        update: {}, // Don't update if already exists
      })

      indexed++
    }

    return NextResponse.json({
      success: true,
      indexed,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
    })
  } catch (error) {
    console.error('Chat index error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to index events' },
      { status: 500 }
    )
  }
}
