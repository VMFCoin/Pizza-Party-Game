import { NextRequest, NextResponse } from 'next/server';
import { getAllEnabledTokens } from '../../../lib/kv-notifications';
import { sendNotifications } from '../../../lib/notifications';

export async function GET(request: NextRequest) {
  // PAUSED: Notifications temporarily disabled
  return NextResponse.json({
    success: true,
    paused: true,
    message: 'Notifications are temporarily paused'
  });

  // Verify this is from Vercel Cron
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  // Allow either Vercel's cron header or manual Authorization header
  const isVercelCron = cronHeader === '1';
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all enabled notification tokens
    const tokens = await getAllEnabledTokens();

    if (tokens.length === 0) {
      return NextResponse.json({ 
        message: 'No enabled tokens found',
        count: 0 
      });
    }

    console.log(`Sending toppings reminder to ${tokens.length} users`);

    // Send notifications
    const today = new Date().toISOString().split('T')[0];
    const results = await sendNotifications({
      tokens,
      title: '🎉 Toppings Available!',
      body: 'Claim your weekly toppings now! Window open for 24 hours.',
      targetUrl: 'https://pizza-party-game.vmfcoin.com',
      notificationId: `pizza-toppings-${today}`,
    });

    return NextResponse.json({ 
      success: true, 
      tokensNotified: tokens.length,
      results 
    });
  } catch (error) {
    console.error('Toppings reminder error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed' 
    }, { status: 500 });
  }
}
