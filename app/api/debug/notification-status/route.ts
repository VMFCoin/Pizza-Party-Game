import { NextRequest, NextResponse } from 'next/server';
import { getNotificationToken } from '../../../lib/kv-notifications';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Require auth to prevent abuse
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
    const token = await getNotificationToken(fid);

    if (!token) {
      return NextResponse.json({
        fid,
        status: 'NOT_FOUND',
        message: 'No notification token found for this FID. User has not added the miniapp or enabled notifications.',
        suggestions: [
          'Open Pizza Party in Farcaster app',
          'Look for "Add Mini App" or notifications prompt',
          'Check if the webhook is receiving events (check Vercel logs)',
        ],
      });
    }

    if (!token.enabled) {
      return NextResponse.json({
        fid,
        status: 'DISABLED',
        message: 'Notification token exists but notifications are disabled.',
        token: {
          hasToken: !!token.token,
          hasUrl: !!token.url,
          enabled: token.enabled,
          createdAt: token.createdAt,
          updatedAt: token.updatedAt,
        },
        suggestions: [
          'User may have disabled notifications',
          'Re-enable notifications in Farcaster app settings',
        ],
      });
    }

    return NextResponse.json({
      fid,
      status: 'ENABLED',
      message: 'Notification token is valid and enabled.',
      token: {
        hasToken: !!token.token,
        tokenPreview: token.token ? `${token.token.substring(0, 8)}...` : null,
        hasUrl: !!token.url,
        url: token.url,
        enabled: token.enabled,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      },
      envCheck: {
        hasFarcasterAppToken: !!process.env.FARCASTER_APP_TOKEN,
        farcasterAppTokenPreview: process.env.FARCASTER_APP_TOKEN
          ? `${process.env.FARCASTER_APP_TOKEN.substring(0, 8)}...`
          : null,
      },
    });
  } catch (error) {
    console.error('Error checking notification status:', error);
    return NextResponse.json({
      error: 'Failed to check notification status',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
