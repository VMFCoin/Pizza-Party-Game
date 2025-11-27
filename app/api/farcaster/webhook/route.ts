import { NextRequest, NextResponse } from 'next/server';
import {
  storeNotificationToken,
  disableNotifications,
  removeNotificationToken,
} from '../../../lib/kv-notifications';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('Received webhook event:', body);
    
    const { event, fid, notificationDetails } = body;

    switch (event) {
      case 'miniapp_added':
      case 'notifications_enabled':
        if (notificationDetails?.token && notificationDetails?.url) {
          await storeNotificationToken(
            parseInt(fid),
            notificationDetails.token,
            notificationDetails.url
          );
        }
        break;

      case 'notifications_disabled':
        await disableNotifications(parseInt(fid));
        break;

      case 'miniapp_removed':
        await removeNotificationToken(parseInt(fid));
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
