import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { getNotificationToken } from '../../../lib/kv-notifications'
import { sendNotifications } from '../../../lib/notifications'

const prisma = new PrismaClient()

// Owner FID to receive security alerts - ONLY this FID receives alerts
const OWNER_FID = 1013491

/**
 * Record a slice send for anti-abuse tracking
 * Called by frontend after successful slice transaction
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      senderAddress,
      senderFid,
      senderUsername,
      recipientAddress,
      recipientFid,
      recipientUsername,
      dailyGameId,
    } = body

    if (!senderAddress || !recipientAddress || !dailyGameId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields',
      }, { status: 400 })
    }

    // Hash IP for privacy-preserving comparison
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown'
    const ipHash = crypto.createHash('sha256').update(ip + process.env.IP_SALT || 'pizza').digest('hex').slice(0, 16)

    const userAgent = request.headers.get('user-agent') || null

    // Check for suspicious patterns BEFORE recording
    const flags = await checkSuspiciousPatterns({
      senderAddress: senderAddress.toLowerCase(),
      senderFid,
      recipientAddress: recipientAddress.toLowerCase(),
      recipientFid,
      ipHash,
    })

    // Record the slice send
    const sliceSend = await prisma.sliceSend.upsert({
      where: {
        senderAddress_recipientAddress_dailyGameId: {
          senderAddress: senderAddress.toLowerCase(),
          recipientAddress: recipientAddress.toLowerCase(),
          dailyGameId: BigInt(dailyGameId),
        },
      },
      update: {
        // Update if re-sending to same recipient same game (shouldn't happen, but handle it)
        senderFid,
        senderUsername,
        recipientFid,
        recipientUsername,
        ipHash,
        userAgent,
        flagged: flags.flagged,
        flagReason: flags.reason,
      },
      create: {
        senderAddress: senderAddress.toLowerCase(),
        senderFid,
        senderUsername,
        recipientAddress: recipientAddress.toLowerCase(),
        recipientFid,
        recipientUsername,
        dailyGameId: BigInt(dailyGameId),
        ipHash,
        userAgent,
        flagged: flags.flagged,
        flagReason: flags.reason,
      },
    })

    // If flagged, send alert to owner
    if (flags.flagged && OWNER_FID) {
      await sendOwnerAlert({
        senderUsername: senderUsername || senderAddress.slice(0, 10),
        senderFid,
        recipientUsername: recipientUsername || recipientAddress.slice(0, 10),
        recipientFid,
        reason: flags.reason || 'Unknown',
        details: flags.details || '',
      })
    }

    return NextResponse.json({
      success: true,
      recorded: true,
      flagged: flags.flagged,
      sliceId: sliceSend.id,
    })
  } catch (error) {
    console.error('Error recording slice:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to record slice',
    }, { status: 500 })
  }
}

interface CheckResult {
  flagged: boolean
  reason?: string
  details?: string
}

async function checkSuspiciousPatterns(params: {
  senderAddress: string
  senderFid: number
  recipientAddress: string
  recipientFid: number
  ipHash: string
}): Promise<CheckResult> {
  const { senderAddress, senderFid, recipientAddress, recipientFid, ipHash } = params
  const flags: string[] = []
  const details: string[] = []

  // Pattern 1: Same FID sending and receiving (should be caught by frontend, but double-check)
  if (senderFid && recipientFid && senderFid === recipientFid) {
    flags.push('SAME_FID')
    details.push(`Sender and recipient have same FID: ${senderFid}`)
  }

  // Pattern 2: Check if this sender->recipient pair has been used before (across multiple games)
  const previousSlices = await prisma.sliceSend.count({
    where: {
      senderAddress,
      recipientAddress,
    },
  })

  if (previousSlices >= 3) {
    flags.push('REPEAT_PAIR')
    details.push(`Sender has sent ${previousSlices} slices to this recipient across games`)
  }

  // Pattern 3: Check if the current recipient has ever claimed from the same IP as this sender
  const recipientClaimedFromSameIp = await prisma.sliceSend.findFirst({
    where: {
      recipientAddress,
      claimerIpHash: ipHash,
    },
  })

  if (recipientClaimedFromSameIp) {
    flags.push('SAME_IP_HISTORY')
    details.push('Recipient has previously claimed from same IP as sender')
  }

  // Pattern 4: High volume from sender in short time
  const recentSends = await prisma.sliceSend.count({
    where: {
      senderAddress,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  })

  if (recentSends >= 5) {
    flags.push('HIGH_VOLUME')
    details.push(`Sender has sent ${recentSends} slices in last 24 hours`)
  }

  // Pattern 5: Recipient receiving from multiple senders (might be a "slice farmer")
  const recipientReceived = await prisma.sliceSend.count({
    where: {
      recipientAddress,
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    },
  })

  if (recipientReceived >= 5) {
    flags.push('FREQUENT_RECIPIENT')
    details.push(`Recipient has received ${recipientReceived} slices in last 7 days`)
  }

  return {
    flagged: flags.length > 0,
    reason: flags.join(', '),
    details: details.join('; '),
  }
}

async function sendOwnerAlert(params: {
  senderUsername: string
  senderFid: number
  recipientUsername: string
  recipientFid: number
  reason: string
  details: string
}) {
  if (!OWNER_FID) return

  // Log the alert (will show in server logs)
  console.warn('🚨 SLICE ABUSE ALERT:', {
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
    const notificationId = `slice-alert-${Date.now()}`
    const title = '⚠️ Slice Alert'
    const body = `${params.reason}: @${params.senderUsername} → @${params.recipientUsername}`

    await sendNotifications({
      tokens: [{ token: ownerToken.token, url: ownerToken.url }],
      title,
      body,
      targetUrl: 'https://pizza-party-game.vmfcoin.com',
      notificationId,
    })

    console.log('Owner alert notification sent successfully')
  } catch (error) {
    console.error('Failed to send owner alert:', error)
  }
}
