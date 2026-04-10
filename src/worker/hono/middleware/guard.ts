import { createMiddleware } from "hono/factory";
import { getAuthContext } from "../../../core/auth/context";
import type { Env } from "../../types";

/**
 * Rejects anonymous requests with 401 before they reach any route handler.
 * Apply after authMiddleware on protected route groups.
 */
export const authGuard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (getAuthContext().isAnonymous) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return next();
});
