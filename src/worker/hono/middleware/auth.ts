import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { runWithAuth } from "../../../core/auth/context";
import { OidcService } from "../../../core/services/oidc.service";
import { D1Adapter } from "../../adapters/db.adapter";
import { KVCacheAdapter } from "../../adapters/cache.adapter";
import type { Env } from "../../types";

/**
 * Resolves the session cookie and sets the auth context.
 * If the session is valid → runWithAuth(user, next)
 * If missing or invalid → runWithAuth(anonymous, next)
 *
 * Anonymous requests are rejected by the auth guard in app.ts
 * before they reach any route handler.
 */
export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // Use __Host- prefix on HTTPS (production), plain name on HTTP (local dev).
  // __Host- requires secure context — browsers silently drop it over plain HTTP.
  const isSecure   = c.req.url.startsWith("https://");
  const cookieName = isSecure ? "__Host-session" : "session";
  const sessionId  = getCookie(c, cookieName);

  if (sessionId) {
    const oidcSvc = new OidcService(
      new D1Adapter(c.env.DB),
      new KVCacheAdapter(c.env.SESSION_CACHE),
      c.env.SKIP_OIDC_URL_VALIDATION === "true",
    );
    const user = await oidcSvc.getSession(sessionId);
    if (user) {
      await oidcSvc.renewSession(sessionId);
      return runWithAuth(user, () => next());
    }
  }

  return runWithAuth({ isAnonymous: true }, () => next());
});
