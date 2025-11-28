import { NextRequest, NextResponse } from 'next/server'
import { getAllEnabledTokens } from '../../../lib/kv-notifications'
import { sendNotifications } from '../../../lib/notifications'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tokens = await getAllEnabledTokens()

    if (tokens.length === 0) {
      return NextResponse.json({
        message: 'No enabled tokens found',
        count: 0,
      })
    }

    console.log(`Sending leaderboard reminder to ${tokens.length} users`)

    const today = new Date().toISOString().split('T')[0]
    const results = await sendNotifications({
      tokens,
      title: '🍕 A Slice of Heaven!',
      body: 'Did you win some cheese on the Daily Jackpot today? Check out the Leaderboard.',
      targetUrl: 'https://pizza-party-game.vmfcoin.com',
      notificationId: `pizza-leaderboard-${today}`,
    })

    return NextResponse.json({
      success: true,
      tokensNotified: tokens.length,
      results,
    })
  } catch (error) {
    console.error('Leaderboard reminder error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 },
    )
  }
}
