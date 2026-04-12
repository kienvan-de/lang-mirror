import type { Context, Next } from "hono";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if the string is a valid UUID v4 */
export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** Hono middleware factory — rejects requests where the named param is not a valid UUID */
export function validateUuidParam(paramName: string) {
  return async (c: Context, next: Next) => {
    const val = c.req.param(paramName);
    if (!val || !UUID_RE.test(val)) {
      return c.json({ error: `Invalid ${paramName}` }, 400);
    }
    return next();
  };
}
