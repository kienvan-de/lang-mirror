import type { ICache } from "../../core/ports/cache.port";

interface CacheEntry {
  value: unknown;
  expiresAt: number | null; // ms timestamp, null = no expiry
}

/**
 * In-memory cache adapter for the desktop (Bun) server.
 * Data is lost on server restart — fine for OIDC state and sessions in dev.
 */
export class MemoryCacheAdapter implements ICache {
  private store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
