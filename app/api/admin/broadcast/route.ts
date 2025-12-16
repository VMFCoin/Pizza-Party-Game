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

    // Use SCAN to iterate through all notification keys (handles large datasets)
    const tokens: Array<{ token: string; url: string }> = [];
    let cursor = 0;
    let totalKeys = 0;

    do {
      const result = await redis.scan(cursor, { match: 'notification:*', count: 100 });
      cursor = result[0];
      const keys = result[1];
      totalKeys += keys.length;

      // Fetch data for each key in this batch
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
    } while (cursor !== 0);

    console.log(`Scanned ${totalKeys} notification keys, found ${tokens.length} enabled`);

    if (totalKeys === 0) {
      return NextResponse.json({
        message: 'No notification keys found in Redis',
        count: 0,
        debug: {
          hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
          hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        }
      });
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
