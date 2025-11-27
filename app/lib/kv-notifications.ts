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
  const data = await redis.get<string>(`notification:${fid}`);
  if (!data) return null;
  return JSON.parse(data);
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

// Get all enabled notification tokens
export async function getAllEnabledTokens(): Promise<Array<{ token: string; url: string }>> {
  const keys = await redis.keys('notification:*');
  const tokens: Array<{ token: string; url: string }> = [];
  
  for (const key of keys) {
    const data = await redis.get<string>(key);
    if (data) {
      const parsed: NotificationToken = JSON.parse(data);
      if (parsed.enabled) {
        tokens.push({
          token: parsed.token,
          url: parsed.url,
        });
      }
    }
  }
  
  return tokens;
}

