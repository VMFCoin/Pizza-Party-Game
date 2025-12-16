import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
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

    // Direct Redis connection for debugging
    const redis = Redis.fromEnv();

    // Get all notification keys
    const keys = await redis.keys('notification:*');
    console.log(`Found ${keys.length} notification keys`);

    if (keys.length === 0) {
      return NextResponse.json({
        message: 'No notification keys found in Redis',
        count: 0,
        debug: {
          hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
          hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        }
      });
    }

    // Fetch all tokens
    const tokens: Array<{ token: string; url: string }> = [];
    for (const key of keys) {
      try {
        const data = await redis.get(key);
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed && parsed.enabled && parsed.token && parsed.url) {
          tokens.push({ token: parsed.token, url: parsed.url });
        }
      } catch (e) {
        console.error(`Error processing ${key}:`, e);
      }
    }

    if (tokens.length === 0) {
      return NextResponse.json({
        message: 'No enabled tokens found',
        keysFound: keys.length,
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
