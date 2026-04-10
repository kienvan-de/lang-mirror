import type { ICache } from "../../core/ports/cache.port";

/**
 * Cloudflare KV cache adapter implementing ICache.
 * KV is eventually consistent — acceptable for session/OIDC state storage.
 */
export class KVCacheAdapter implements ICache {
  constructor(private kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.kv.get<T>(key, "json");
    return value ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      ...(ttlSeconds ? { expirationTtl: ttlSeconds } : {}),
    });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
