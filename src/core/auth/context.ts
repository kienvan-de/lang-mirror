import { AsyncLocalStorage } from "async_hooks";
import { UnauthorizedError } from "../errors";

export interface AuthUser {
  isAnonymous: false;
  id: string;           // users.id (internal UUID)
  userId: string;       // OIDC sub claim
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "user" | "admin";
}

export interface AuthAnonymous {
  isAnonymous: true;
}

export type AuthContext = AuthUser | AuthAnonymous;

/**
 * AsyncLocalStorage for the current request's auth context.
 * Set by server/worker middleware via runWithAuth().
 * Read by services via getAuthContext() / requireAuth().
 */
export const authStorage = new AsyncLocalStorage<AuthContext>();

/** Returns the current auth context. Returns anonymous if outside any request. */
export function getAuthContext(): AuthContext {
  return authStorage.getStore() ?? { isAnonymous: true };
}

/** Returns the authenticated user or throws UnauthorizedError. */
export function requireAuth(): AuthUser {
  const ctx = getAuthContext();
  if (ctx.isAnonymous) throw new UnauthorizedError();
  return ctx;
}

/** Returns true if the current user has admin role. */
export function isAdmin(): boolean {
  const ctx = getAuthContext();
  return !ctx.isAnonymous && ctx.role === "admin";
}

/** Returns true if the current user owns the given owner_id, or is admin. */
export function canAccess(ownerId: string | null): boolean {
  const ctx = getAuthContext();
  if (ctx.isAnonymous) return false;
  if (ctx.role === "admin") return true;
  return ownerId === ctx.id;
}

/**
 * Run a function within the given auth context.
 * Called by server/worker middleware — not by services directly.
 */
export function runWithAuth<T>(ctx: AuthContext, fn: () => Promise<T>): Promise<T> {
  return authStorage.run(ctx, fn);
}
