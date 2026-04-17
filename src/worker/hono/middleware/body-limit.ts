/**
 * Global body-size limiter for JSON API routes.
 *
 * Rejects requests whose Content-Length header exceeds the configured maximum.
 * This is a best-effort early check — Content-Length can be absent or spoofed.
 * Routes that accept large payloads (import, recordings) enforce their own
 * authoritative byte-level limits via stream reading; this middleware catches
 * the common case of accidentally or maliciously oversized JSON bodies that
 * would otherwise be buffered entirely into Worker memory by c.req.json().
 *
 * Default: 256 KB — generous for any JSON API payload in this app.
 * (Recordings and imports enforce their own larger limits.)
 */
import { createMiddleware } from "hono/factory";
import type { Env } from "../../types";

const DEFAULT_MAX_BYTES = 256 * 1024; // 256 KB

export function bodyLimitMiddleware(maxBytes = DEFAULT_MAX_BYTES) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const cl = c.req.header("Content-Length");
    if (cl) {
      const len = parseInt(cl, 10);
      if (!isNaN(len) && len > maxBytes) {
        return c.json({ error: "Request body too large" }, 413);
      }
    }
    return next();
  });
}
