import { NextRequest, NextResponse } from 'next/server'
import { getNotificationToken } from '../../../lib/kv-notifications'
import { sendNotifications } from '../../../lib/notifications'

const OWNER_FID = 1013491

export async function POST(req: NextRequest) {
  try {
    const { castHash, playerAddress, playerFid, outcome, txHash } =
      await req.json() as {
        castHash:      string
        playerAddress: string
        playerFid:     number
        outcome:       number  // 0=Nothing, 1=FreeSlice, 2=Gold
        txHash:        string
      }

    if (!castHash || !playerAddress) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    console.log('[share/record]', { castHash, playerAddress, outcome, txHash })

    // Gold winner — send urgent notification to owner (non-fatal if it fails)
    if (outcome === 2) {
      notifyGoldWinner(playerAddress, playerFid, txHash).catch((err) =>
        console.error('[share/record] Gold alert failed (non-fatal):', err)
      )
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[share/record]', err)
    return NextResponse.json({ error: 'Failed to record share' }, { status: 500 })
  }
}

async function notifyGoldWinner(
  playerAddress: string,
  playerFid: number,
  txHash: string
): Promise<void> {
  const shortAddr = `${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`
  const basescanTx = `https://basescan.org/tx/${txHash}`

  // Log it — always visible in server logs
  console.warn('\u{1F3C6} GOLD SLICE WINNER:', {
    playerAddress,
    playerFid,
    txHash,
    basescanTx,
    timestamp: new Date().toISOString(),
  })

  try {
    // Get owner's notification token from KV store (same as slice alerts)
    const ownerToken = await getNotificationToken(OWNER_FID)

    if (!ownerToken || !ownerToken.enabled) {
      console.log('Owner notification token not found or disabled')
      return
    }

    await sendNotifications({
      tokens: [{ token: ownerToken.token, url: ownerToken.url }],
      title: '\u{1F3C6} GOLD SLICE WINNER!',
      body: `${shortAddr} hit Gold! FID:${playerFid} Tx:${txHash.slice(0, 10)}`,
      targetUrl: basescanTx,
      notificationId: `gold-winner-${Date.now()}`,
    })

    console.log('Gold winner notification sent to owner')
  } catch (error) {
    console.error('Failed to send gold winner notification:', error)
  }
}
