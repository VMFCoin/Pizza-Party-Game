import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

interface NotificationToken {
  fid: number;
  token: string;
  url: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Store a notification token
export async function storeNotificationToken(
  fid: number,
  token: string,
  url: string
): Promise<void> {
  const data: NotificationToken = {
    fid,
    token,
    url,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  await redis.set(`notification:${fid}`, JSON.stringify(data));
  console.log(`Stored notification token for FID ${fid}`);
}

// Get a notification token by FID
export async function getNotificationToken(
  fid: number
): Promise<NotificationToken | null> {
  const data = await redis.get(`notification:${fid}`);
  if (!data) return null;
  
  // Handle if data is already an object or needs parsing
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  return data as NotificationToken;
}

// Disable notifications for a user
export async function disableNotifications(fid: number): Promise<void> {
  const existing = await getNotificationToken(fid);
  if (existing) {
    await redis.set(`notification:${fid}`, JSON.stringify({
      ...existing,
      enabled: false,
      updatedAt: new Date().toISOString(),
    }));
    console.log(`Disabled notifications for FID ${fid}`);
  }
}

// Remove a notification token
export async function removeNotificationToken(fid: number): Promise<void> {
  await redis.del(`notification:${fid}`);
  console.log(`Removed notification token for FID ${fid}`);
}

// Get all enabled notification tokens (uses SCAN for large datasets)
export async function getAllEnabledTokens(): Promise<Array<{ token: string; url: string }>> {
  try {
    const tokens: Array<{ token: string; url: string }> = [];
    let cursor: string | number = 0;
    let totalKeys = 0;

    // Use SCAN to iterate through keys (required for 600+ keys on Upstash)
    do {
      const result = await redis.scan(cursor, { match: 'notification:*', count: 100 });
      cursor = result[0] as string | number;
      const keys = result[1];
      totalKeys += keys.length;

      for (const key of keys) {
        try {
          const data = await redis.get(key);

          let parsed: NotificationToken;

          if (typeof data === 'string') {
            parsed = JSON.parse(data);
          } else if (data && typeof data === 'object') {
            parsed = data as NotificationToken;
          } else {
            continue;
          }

          if (parsed.enabled && parsed.token && parsed.url) {
            tokens.push({
              token: parsed.token,
              url: parsed.url,
            });
          }
        } catch (error) {
          console.error(`Error processing key ${key}:`, error);
        }
      }
    } while (cursor !== 0 && cursor !== '0');

    console.log(`Scanned ${totalKeys} notification keys, found ${tokens.length} enabled`);
    return tokens;
  } catch (error) {
    console.error('Error in getAllEnabledTokens:', error);
    return [];
  }
}
