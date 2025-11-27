import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import {
  storeNotificationToken,
  disableNotifications,
  removeNotificationToken,
} from '../../../lib/kv-notifications';

const decodeBase64Json = (value: unknown) => {
  if (typeof value !== 'string') return null;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (err) {
    console.error('Failed to decode base64 payload', err);
    return null;
  }
};

type NotificationDetails = { token?: string; url?: string };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('Received webhook event:', body);

    // Handle signed Farcaster envelope (header/payload/signature)
    const decodedHeader = decodeBase64Json((body as Record<string, unknown>).header);
    const decodedPayload = decodeBase64Json((body as Record<string, unknown>).payload);

    const event =
      decodedPayload?.event ||
      (body as Record<string, unknown>).event;

    const fidRaw =
      decodedPayload?.fid ||
      decodedHeader?.fid ||
      (body as Record<string, unknown>).fid;

    const notificationDetails: NotificationDetails =
      decodedPayload?.notificationDetails ||
      (body as Record<string, unknown>).notificationDetails ||
      decodedPayload?.notification_details; // some clients use snake_case

    const fid = fidRaw ? Number(fidRaw) : NaN;

    switch (event) {
      case 'miniapp_added':
      case 'frame_added':
      case 'notifications_enabled':
        if (!Number.isNaN(fid) && notificationDetails?.token && notificationDetails?.url) {
          await storeNotificationToken(fid, notificationDetails.token, notificationDetails.url);
        }
        break;

      case 'notifications_disabled':
        if (!Number.isNaN(fid)) {
          await disableNotifications(fid);
        }
        break;

      case 'miniapp_removed':
        if (!Number.isNaN(fid)) {
          await removeNotificationToken(fid);
        }
        break;

      default:
        console.warn('Unhandled webhook event type:', event);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
