/**
 * Platform-agnostic cache interface for short-lived data.
 *
 * Used for:
 *   - OIDC state + code_verifier + nonce (TTL 10 min)
 *   - Sessions (TTL 7 days, rolling)
 *
 * Implemented by:
 *   - KVCacheAdapter  (src/worker/adapters/cache.adapter.ts)  — Cloudflare KV
 */
export interface ICache {
  /** Get a cached value. Returns null if not found or expired. */
  get<T>(key: string): Promise<T | null>;

  /** Store a value with optional TTL in seconds. */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Delete a key (no-op if not found). */
  delete(key: string): Promise<void>;
}
