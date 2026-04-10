import { createMiddleware } from "hono/factory";
import { getAuthContext } from "../../../core/auth/context";
import type { Env } from "../../types";

/**
 * Rejects non-admin requests with 403.
 * Must be applied after authMiddleware (requires auth context to be set).
 */
export const adminGuard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const ctx = getAuthContext();
  if (ctx.isAnonymous || ctx.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }
  return next();
});
