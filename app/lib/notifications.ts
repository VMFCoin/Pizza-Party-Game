export async function sendNotifications({
  tokens,
  title,
  body,
  targetUrl,
  notificationId,
}: {
  tokens: Array<{ token: string; url: string }>;
  title: string;
  body: string;
  targetUrl: string;
  notificationId: string;
}) {
  const appToken = process.env.FARCASTER_APP_TOKEN;
  if (!appToken) {
    throw new Error('Missing FARCASTER_APP_TOKEN env var for notification auth');
  }

  // Group tokens by URL
  const tokensByUrl = tokens.reduce((acc, t) => {
    if (!acc[t.url]) acc[t.url] = [];
    acc[t.url].push(t.token);
    return acc;
  }, {} as Record<string, string[]>);

  const results = [];

  // Send to each URL in batches of 100
  for (const [url, tokenList] of Object.entries(tokensByUrl)) {
    for (let i = 0; i < tokenList.length; i += 100) {
      const batch = tokenList.slice(i, i + 100);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${appToken}`,
          },
          body: JSON.stringify({
            notificationId: notificationId.slice(0, 128),
            title: title.slice(0, 32),
            body: body.slice(0, 128),
            targetUrl,
            tokens: batch,
          }),
        });

        // Try to parse as JSON, but handle non-JSON responses gracefully
        const contentType = response.headers.get('content-type') || '';
        let result: unknown;
        if (contentType.includes('application/json')) {
          try {
            result = await response.json();
          } catch {
            result = await response.text();
          }
        } else {
          result = await response.text();
        }

        results.push({
          success: response.ok,
          status: response.status,
          batchSize: batch.length,
          result,
        });

        console.log(`Sent to ${batch.length} tokens (status ${response.status}):`, result);
      } catch (error) {
        console.error('Notification send error:', error);
        results.push({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          batchSize: batch.length 
        });
      }
    }
  }

  return results;
}
