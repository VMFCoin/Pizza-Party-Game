import { NextRequest, NextResponse } from 'next/server'
import { getNotificationToken } from '@/app/lib/kv-notifications'
import { sendNotifications } from '@/app/lib/notifications'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/**
 * Send a notification to a user when they receive a free slice
 * POST /api/slice-notification
 * Body: { recipientFid: number, parlorName?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { recipientFid, parlorName } = body

    if (!recipientFid) {
      return NextResponse.json({
        success: false,
        error: 'recipientFid is required',
      }, { status: 400 })
    }

    // Get the recipient's notification token
    const tokenData = await getNotificationToken(recipientFid)

    if (!tokenData || !tokenData.enabled) {
      return NextResponse.json({
        success: false,
        error: 'Recipient has not enabled notifications',
        recipientFid,
      })
    }

    // Build notification message
    const title = '🍕 Free Slice!'
    const franchiseName = parlorName || 'A Pizza Parlor'
    const body_text = `${franchiseName} sent you a free slice! Tap to claim.`

    // Send the notification
    const results = await sendNotifications({
      tokens: [{ token: tokenData.token, url: tokenData.url }],
      title,
      body: body_text,
      targetUrl: 'https://farcaster.xyz/miniapps/wgY6OPqYoIkz/pizza-party',
      notificationId: `slice-${recipientFid}-${Date.now()}`,
    })

    const success = results.some(r => r.success)

    return NextResponse.json({
      success,
      recipientFid,
      results,
    })
  } catch (error) {
    console.error('Slice notification error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification',
    }, { status: 500 })
  }
}
