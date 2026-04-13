/**
 * KV-backed sliding-window rate limiter for Cloudflare Workers.
 *
 * Each authenticated user gets an independent counter stored in SESSION_CACHE KV.
 * The window is rolling: every request updates the TTL.
 *
 * Usage:
 *   importRouter.use("*", importRateLimit);
 *
 * Defaults: 20 requests per 60-second window per user.
 */
import { createMiddleware } from "hono/factory";
import { getAuthContext } from "../../../core/auth/context";
import type { Env } from "../../types";

interface RateLimitOptions {
  /** Maximum requests allowed within the window. Default: 20 */
  limit: number;
  /** Window size in seconds. Default: 60 */
  windowSecs: number;
  /** KV key prefix — must be unique per route group. */
  keyPrefix: string;
}

interface RateLimitRecord {
  count: number;
  /** Unix epoch (ms) when the window started */
  windowStart: number;
}

export function rateLimitMiddleware(opts: RateLimitOptions) {
  const { limit, windowSecs, keyPrefix } = opts;

  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ctx = getAuthContext();
    // Auth guard runs before this, so ctx should never be anonymous here.
    // Fail-open if somehow reached anonymously (auth guard will catch it).
    if (ctx.isAnonymous) return next();

    const kv  = c.env.SESSION_CACHE;
    const key = `rl:${keyPrefix}:${ctx.id}`;
    const now = Date.now();

    const existing = await kv.get<RateLimitRecord>(key, "json");

    let record: RateLimitRecord;
    if (!existing || now - existing.windowStart > windowSecs * 1000) {
      // New or expired window — start fresh
      record = { count: 1, windowStart: now };
    } else {
      record = { count: existing.count + 1, windowStart: existing.windowStart };
    }

    // Remaining TTL for the current window (always reset to full window on update)
    await kv.put(key, JSON.stringify(record), { expirationTtl: windowSecs });

    // Emit standard rate-limit headers so clients can back off gracefully
    const remaining = Math.max(0, limit - record.count);
    const resetSec  = Math.ceil((record.windowStart + windowSecs * 1000 - now) / 1000);
    c.res.headers.set("X-RateLimit-Limit",     String(limit));
    c.res.headers.set("X-RateLimit-Remaining", String(remaining));
    c.res.headers.set("X-RateLimit-Reset",     String(resetSec));

    if (record.count > limit) {
      return c.json(
        { error: "Too many requests — please wait before retrying" },
        429
      );
    }

    return next();
  });
}

/** Pre-configured limiter for import endpoints: 20 req / 60 s per user */
export const importRateLimit = rateLimitMiddleware({
  limit:      20,
  windowSecs: 60,
  keyPrefix:  "import",
});
