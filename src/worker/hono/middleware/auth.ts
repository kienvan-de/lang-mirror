import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { runWithAuth } from "../../../core/auth/context";
import { OidcService } from "../../../core/services/oidc.service";
import { D1Adapter } from "../../adapters/db.adapter";
import { KVCacheAdapter } from "../../adapters/cache.adapter";
import type { Env } from "../../types";

export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const sessionId = getCookie(c, "session");

  if (sessionId) {
    const oidcSvc = new OidcService(
      new D1Adapter(c.env.DB),
      new KVCacheAdapter(c.env.SESSION_CACHE)
    );
    const user = await oidcSvc.getSession(sessionId);
    if (user) {
      // Rolling session — reset TTL on each request
      await oidcSvc.renewSession(sessionId);
      return runWithAuth(user, () => next());
    }
  }

  // No valid session — run as anonymous
  return runWithAuth({ isAnonymous: true }, () => next());
});
