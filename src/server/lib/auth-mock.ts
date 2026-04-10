import { runWithAuth, type AuthUser } from "../../core/auth/context";

/**
 * Fixed mock admin user for desktop development.
 * All services see this user — no OIDC, no login required.
 */
export const MOCK_ADMIN: AuthUser = {
  isAnonymous: false,
  id:        "desktop-admin",
  userId:    "desktop-admin",
  email:     "admin@localhost",
  name:      "Desktop Admin",
  avatarUrl: null,
  role:      "admin",
};

/**
 * Wrap an async function with the mock admin context.
 * Called by the server router around every request handler.
 */
export function withMockAuth<T>(fn: () => Promise<T>): Promise<T> {
  return runWithAuth(MOCK_ADMIN, fn);
}
