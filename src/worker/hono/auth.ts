import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { buildContext } from "../lib/context";
import { getAuthContext } from "../../core/auth/context";
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
  const { oidc } = buildContext(c.env);
  return c.json(await oidc.listProviders());
});

// GET /api/auth/login/:providerId — kick off OIDC flow (browser navigates directly)
authRouter.get("/login/:providerId", async (c) => {
  const { oidc } = buildContext(c.env);
  const { redirectUrl } = await oidc.initiateLogin(c.req.param("providerId"));
  return c.redirect(redirectUrl, 302);
});

// GET /api/auth/callback/:providerId — OIDC redirect callback
authRouter.get("/callback/:providerId", async (c) => {
  const code  = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  const { oidc, settings } = buildContext(c.env);
  const baseUrl  = await settings.getValue("app.baseUrl", "");
  const isSecure = baseUrl.startsWith("https://");

  const loginUrl   = (err: string) => baseUrl ? `${baseUrl}/login?error=${encodeURIComponent(err)}` : `/login?error=${encodeURIComponent(err)}`;
  const successUrl = baseUrl ? `${baseUrl}/?login=success` : "/?login=success";

  if (error) return c.redirect(loginUrl(error), 302);
  if (!code || !state) return c.redirect(loginUrl("missing_params"), 302);

  const { sessionId } = await oidc.handleCallback(
    c.req.param("providerId"), code, state
  );

  setCookie(c, "session", sessionId, {
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
  const session = c.req.header("Cookie")?.match(/session=([^;]+)/)?.[1];
  if (session) {
    const { oidc } = buildContext(c.env);
    await oidc.deleteSession(session);
  }
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

// ── Provider management (admin) ───────────────────────────────────────────────

// POST /api/auth/providers — add a new provider
authRouter.post("/providers", async (c) => {
  const body = await c.req.json();
  const { oidc } = buildContext(c.env);
  return c.json(await oidc.addProvider(body), 201);
});

// PUT /api/auth/providers/:id
authRouter.put("/providers/:id", async (c) => {
  const body = await c.req.json();
  const { oidc } = buildContext(c.env);
  return c.json(await oidc.updateProvider(c.req.param("id"), body));
});

// DELETE /api/auth/providers/:id
authRouter.delete("/providers/:id", async (c) => {
  const { oidc } = buildContext(c.env);
  await oidc.deleteProvider(c.req.param("id"));
  return c.json({ deleted: true });
});
