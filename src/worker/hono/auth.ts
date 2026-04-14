import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { buildContext } from "../lib/context";
import { getAuthContext } from "../../core/auth/context";
import { adminGuard } from "./middleware/admin";
import type { Env } from "../types";

export const authRouter = new Hono<{ Bindings: Env }>();

// GET /api/auth/me — returns current user or 401
authRouter.get("/me", async (c) => {
  const ctx = getAuthContext();
  if (ctx.isAnonymous) return c.json({ error: "Authentication required" }, 401);
  const { isAnonymous, ...user } = ctx;
  return c.json(user);
});

// GET /api/auth/providers — public, lists enabled OIDC providers
authRouter.get("/providers", async (c) => {
  const { oidc } = await buildContext(c.env);
  return c.json(await oidc.listProviders());
});

// GET /api/auth/login/:providerId — kick off OIDC flow (browser navigates directly)
authRouter.get("/login/:providerId", async (c) => {
  const { oidc } = await buildContext(c.env);
  const { redirectUrl } = await oidc.initiateLogin(c.req.param("providerId"));
  return c.redirect(redirectUrl, 302);
});

// GET /api/auth/callback/:providerId — OIDC redirect callback
authRouter.get("/callback/:providerId", async (c) => {
  const code  = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  const { oidc } = await buildContext(c.env);

  // In production APP_BASE_URL is unset → relative URLs work (Worker serves the SPA).
  // In local dev (Vite on a different port) set APP_BASE_URL=http://localhost:5173
  // in .dev.vars so the browser is redirected back to the Vite dev server after login.
  const base       = c.env.APP_BASE_URL ?? "";
  const loginUrl   = (err: string) => `${base}/login?error=${encodeURIComponent(err)}`;
  const successUrl = `${base}/?login=success`;

  if (error) return c.redirect(loginUrl(error), 302);
  if (!code || !state) return c.redirect(loginUrl("missing_params"), 302);

  let sessionId: string;
  try {
    ({ sessionId } = await oidc.handleCallback(
      c.req.param("providerId"), code, state
    ));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("DEACTIVATED:")) {
      const reason = encodeURIComponent(msg.slice("DEACTIVATED:".length));
      return c.redirect(`${base}/deactivated?reason=${reason}`, 302);
    }
    return c.redirect(loginUrl(msg || "login_failed"), 302);
  }

  // Use __Host- prefix on HTTPS (production) for maximum cookie security.
  // Fall back to plain "session" on HTTP (local dev) — __Host- is silently
  // dropped by browsers over non-secure connections.
  const isSecure   = c.req.url.startsWith("https://");
  const cookieName = isSecure ? "__Host-session" : "session";

  setCookie(c, cookieName, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure:   isSecure,
    maxAge:   7 * 24 * 60 * 60,
    path:     "/",
  });

  return c.redirect(successUrl, 302);
});

// POST /api/auth/logout — clears session
authRouter.post("/logout", async (c) => {
  // CSRF guard — check Origin header only (Referer is suppressible via
  // Referrer-Policy and uses substring match which is weaker).
  // SameSite=Lax on the cookie is the primary CSRF defence for modern browsers;
  // this Origin check is belt-and-suspenders for older ones.
  const origin = c.req.header("Origin");
  const host   = c.req.header("Host");
  if (origin && host) {
    const allowedOrigins = new Set([
      `http://${host}`,
      `https://${host}`,
      // Allow the Vite dev server origin in local dev (APP_BASE_URL=http://localhost:5173)
      ...(c.env.APP_BASE_URL ? [c.env.APP_BASE_URL] : []),
    ]);
    if (!allowedOrigins.has(origin)) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const isSecure   = c.req.url.startsWith("https://");
  const cookieName = isSecure ? "__Host-session" : "session";
  const session    = getCookie(c, cookieName);

  if (session) {
    const { oidc } = await buildContext(c.env);
    await oidc.deleteSession(session);
  }
  deleteCookie(c, cookieName, { path: "/" });
  return c.json({ ok: true });
});

// ── Provider management (admin) ───────────────────────────────────────────────

// POST /api/auth/providers — add a new provider
authRouter.post("/providers", adminGuard, async (c) => {
  const body = await c.req.json();
  const { oidc } = await buildContext(c.env);
  return c.json(await oidc.addProvider(body), 201);
});

// PUT /api/auth/providers/:id
authRouter.put("/providers/:id", adminGuard, async (c) => {
  const body = await c.req.json();
  const { oidc } = await buildContext(c.env);
  return c.json(await oidc.updateProvider(c.req.param("id"), body));
});

// DELETE /api/auth/providers/:id
authRouter.delete("/providers/:id", adminGuard, async (c) => {
  const { oidc } = await buildContext(c.env);
  await oidc.deleteProvider(c.req.param("id"));
  return c.json({ deleted: true });
});
