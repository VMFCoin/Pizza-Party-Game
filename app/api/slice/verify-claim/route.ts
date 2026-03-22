import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { getNotificationToken } from '../../../lib/kv-notifications'
import { sendNotifications } from '../../../lib/notifications'
import { isRecipientBanned, isSliceBlocked } from '../../../lib/constants/banList'

const prisma = new PrismaClient()

// Owner FID to receive security alerts - ONLY this FID receives alerts
const OWNER_FID = 1013491

/**
 * Verify a slice claim is legitimate (Layer 2: Claim-time FID verification)
 * Called by frontend before claiming a slice
 *
 * Returns:
 * - allowed: true if claim should proceed
 * - blocked: true if claim should be blocked (same FID, suspicious pattern)
 * - reason: explanation if blocked
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      claimerAddress,
      claimerFid,
      senderAddress,
      dailyGameId,
    } = body

    if (!claimerAddress || !senderAddress || !dailyGameId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields',
      }, { status: 400 })
    }

    // Block banned users from claiming slices
    if (isRecipientBanned(claimerFid, claimerAddress)) {
      return NextResponse.json({
        success: true,
        allowed: false,
        blocked: true,
        reason: 'This account is restricted.',
      })
    }

    // Block slice-blocked users from claiming any free slices
    if (isSliceBlocked(claimerFid)) {
      return NextResponse.json({
        success: true,
        allowed: false,
        blocked: true,
        reason: 'This account is not eligible to receive free slices.',
      })
    }

    // Hash IP for comparison
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown'
    const ipHash = crypto.createHash('sha256').update(ip + process.env.IP_SALT || 'pizza').digest('hex').slice(0, 16)

    // Find the slice record
    const sliceRecord = await prisma.sliceSend.findFirst({
      where: {
        senderAddress: senderAddress.toLowerCase(),
        recipientAddress: claimerAddress.toLowerCase(),
        dailyGameId: BigInt(dailyGameId),
      },
    })

    // If no record found, allow claim (might be an older slice before tracking started)
    if (!sliceRecord) {
      return NextResponse.json({
        success: true,
        allowed: true,
        reason: 'No record found - proceeding with claim',
      })
    }

    // LAYER 2: Verify claimer FID is different from sender FID
    if (claimerFid && sliceRecord.senderFid && claimerFid === sliceRecord.senderFid) {
      // This is a self-slice attempt - block it
      await sendOwnerAlert({
        type: 'SAME_FID_CLAIM',
        senderFid: sliceRecord.senderFid,
        claimerFid,
        senderAddress: sliceRecord.senderAddress,
        claimerAddress: claimerAddress.toLowerCase(),
      })

      return NextResponse.json({
        success: true,
        allowed: false,
        blocked: true,
        reason: 'This slice was sent from your own Farcaster account. Self-claiming is not allowed.',
      })
    }

    // Check if claimer IP matches sender IP (strong indicator of same person)
    if (sliceRecord.ipHash && sliceRecord.ipHash === ipHash) {
      // Same IP - block the claim and alert owner
      await prisma.sliceSend.update({
        where: { id: sliceRecord.id },
        data: {
          flagged: true,
          flagReason: sliceRecord.flagReason
            ? `${sliceRecord.flagReason}, SAME_IP_CLAIM`
            : 'SAME_IP_CLAIM',
        },
      })

      await sendOwnerAlert({
        type: 'SAME_IP_CLAIM',
        senderFid: sliceRecord.senderFid,
        claimerFid: claimerFid || 0,
        senderAddress: sliceRecord.senderAddress,
        claimerAddress: claimerAddress.toLowerCase(),
        note: 'Sender and claimer have same IP address — BLOCKED',
      })

      return NextResponse.json({
        success: true,
        allowed: false,
        blocked: true,
        reason: 'This slice cannot be claimed from the same network it was sent from. Self-serving is not allowed.',
      })
    }

    // Update the slice record with claim info
    await prisma.sliceSend.update({
      where: { id: sliceRecord.id },
      data: {
        claimed: true,
        claimedAt: new Date(),
        claimerIpHash: ipHash,
      },
    })

    return NextResponse.json({
      success: true,
      allowed: true,
      sliceId: sliceRecord.id,
    })
  } catch (error) {
    console.error('Error verifying slice claim:', error)
    // On error, allow claim to proceed (don't break the game)
    return NextResponse.json({
      success: true,
      allowed: true,
      error: 'Verification failed, proceeding with claim',
    })
  }
}

async function sendOwnerAlert(params: {
  type: string
  senderFid: number
  claimerFid: number
  senderAddress: string
  claimerAddress: string
  note?: string
}) {
  if (!OWNER_FID) return

  // Log the alert (will show in server logs)
  console.warn('🚨 SLICE CLAIM ALERT:', {
    ...params,
    timestamp: new Date().toISOString(),
  })

  try {
    // Get owner's notification token from KV store
    const ownerToken = await getNotificationToken(OWNER_FID)

    if (!ownerToken || !ownerToken.enabled) {
      console.log('Owner notification token not found or disabled')
      return
    }

    // Send notification using existing system
    const notificationId = `claim-alert-${Date.now()}`
    const title = `🚨 ${params.type}`
    const body = params.note || `FID ${params.senderFid} → FID ${params.claimerFid}`

    await sendNotifications({
      tokens: [{ token: ownerToken.token, url: ownerToken.url }],
      title,
      body,
      targetUrl: 'https://pizza-party-game.vmfcoin.com',
      notificationId,
    })

    console.log('Owner claim alert notification sent successfully')
  } catch (error) {
    console.error('Failed to send owner alert:', error)
  }
}
