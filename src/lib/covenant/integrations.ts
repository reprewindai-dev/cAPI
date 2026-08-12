import { createClient } from "redis";

// Reuse client if it exists globally to avoid reconnecting on every request
declare global {
  var _redisClient: ReturnType<typeof createClient> | undefined;
}

async function getRedisClient() {
  if (!global._redisClient) {
    global._redisClient = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
    global._redisClient.on("error", (err) => console.error("Redis error:", err));
    await global._redisClient.connect().catch(() => {});
  }
  return global._redisClient;
}

export class IntegrationUnavailable extends Error {
  readonly code = "INTEGRATION_UNAVAILABLE";
}

export class AuthorityDenied extends Error {
  readonly code = "AUTHORITY_DENIED";
  readonly status = 403;
}

export function requireIntegration(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new IntegrationUnavailable(`${name} integration is not configured`);
  return value.replace(/\/$/, "");
}

export async function postIntegration(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second fail-fast
  
  const cacheKey = `cAPI:integration:${Buffer.from(url).toString('base64')}:${Buffer.from(JSON.stringify(body)).toString('base64')}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AuthorityDenied(`Authority denied: HTTP ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Invalid response");
    }

    // Cache successful response asynchronously
    getRedisClient().then(client => {
      if (client.isOpen) client.setEx(cacheKey, 3600, JSON.stringify(result)).catch(console.error);
    }).catch(console.error);

    return result as Record<string, unknown>;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof AuthorityDenied) {
      throw error;
    }
    
    // Attempt to retrieve stale data
    try {
      const client = await getRedisClient();
      if (client.isOpen) {
        const cached = await client.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed._stale = true; // Mark as stale
          return parsed;
        }
      }
    } catch (redisError) {
      console.error("Failed to retrieve stale cache:", redisError);
    }

    throw new IntegrationUnavailable(`Integration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
