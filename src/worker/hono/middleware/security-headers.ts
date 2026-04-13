/**
 * Security response-headers middleware.
 *
 * Applied globally (after every handler) to harden all API responses:
 *
 *   X-Content-Type-Options: nosniff
 *     Prevents browsers from MIME-sniffing a response away from the declared
 *     Content-Type, blocking drive-by-download attacks on JSON endpoints.
 *
 *   X-Frame-Options: DENY
 *     Forbids the app from being embedded in <iframe> / <frame> / <object>,
 *     mitigating clickjacking attacks.
 *
 *   Referrer-Policy: strict-origin-when-cross-origin
 *     Sends full URL as referrer for same-origin requests, only the origin for
 *     cross-origin HTTPS→HTTPS, and nothing for downgrade (HTTPS→HTTP).
 */
import { createMiddleware } from "hono/factory";
import type { Env } from "../../types";

export const securityHeadersMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
});
