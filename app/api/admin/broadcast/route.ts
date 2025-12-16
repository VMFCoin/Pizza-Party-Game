import { NextRequest, NextResponse } from 'next/server';
import { getAllEnabledTokens } from '../../../lib/kv-notifications';
import { sendNotifications } from '../../../lib/notifications';

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, message, notificationId } = body;

    if (!title || !message) {
      return NextResponse.json({ error: 'Missing title or message' }, { status: 400 });
    }

    // Get all enabled notification tokens
    const tokens = await getAllEnabledTokens();
    if (tokens.length === 0) {
      return NextResponse.json({
        message: 'No enabled tokens found',
        count: 0
      });
    }

    console.log(`Broadcasting to ${tokens.length} users`);
    console.log(`Title: ${title}`);
    console.log(`Message: ${message}`);

    // Send notifications
    const results = await sendNotifications({
      tokens,
      title: title.slice(0, 32),
      body: message.slice(0, 128),
      targetUrl: 'https://pizza-party-game.vmfcoin.com',
      notificationId: notificationId || `broadcast-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      tokensNotified: tokens.length,
      results
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed'
    }, { status: 500 });
  }
}
