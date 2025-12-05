import { NextRequest, NextResponse } from 'next/server';
import { getNotificationToken } from '../../../lib/kv-notifications';
import { sendNotifications } from '../../../lib/notifications';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fidParam = searchParams.get('fid');

  if (!fidParam) {
    return NextResponse.json({ error: 'Missing fid parameter' }, { status: 400 });
  }

  const fid = parseInt(fidParam, 10);
  if (isNaN(fid)) {
    return NextResponse.json({ error: 'Invalid fid parameter' }, { status: 400 });
  }

  try {
    const tokenData = await getNotificationToken(fid);

    if (!tokenData) {
      return NextResponse.json({
        error: 'No notification token found for this FID',
        fid,
      }, { status: 404 });
    }

    if (!tokenData.enabled) {
      return NextResponse.json({
        error: 'Notifications are disabled for this FID',
        fid,
      }, { status: 400 });
    }

    console.log('Sending test notification to FID:', fid);
    console.log('Token URL:', tokenData.url);
    console.log('FARCASTER_APP_TOKEN exists:', !!process.env.FARCASTER_APP_TOKEN);

    const results = await sendNotifications({
      tokens: [{ token: tokenData.token, url: tokenData.url }],
      title: '🍕 Test Notification',
      body: 'This is a test notification from Pizza Party debug endpoint.',
      targetUrl: 'https://pizza-party-game.vmfcoin.com',
      notificationId: `test-${fid}-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      fid,
      tokenUrl: tokenData.url,
      results,
      message: results[0]?.success
        ? 'Notification sent successfully! Check your Farcaster app.'
        : 'Notification may have failed. Check the results for details.',
    });
  } catch (error) {
    console.error('Test notification error:', error);
    return NextResponse.json({
      error: 'Failed to send test notification',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
