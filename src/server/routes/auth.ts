/**
 * Mock /api/auth/* routes for the desktop server.
 * The desktop is always logged in as the mock admin — no OIDC flow needed.
 */
import { json } from "../lib/response";
import { MOCK_ADMIN } from "../lib/auth-mock";

export async function handle(req: Request, url: URL): Promise<Response> {
  const path   = url.pathname;
  const method = req.method;

  // GET /api/auth/me — always returns the mock admin
  if (method === "GET" && path === "/api/auth/me") {
    const { isAnonymous, ...user } = MOCK_ADMIN;
    return json(user);
  }

  // GET /api/auth/providers — no providers on desktop
  if (method === "GET" && path === "/api/auth/providers") {
    return json([]);
  }

  // POST /api/auth/logout — no-op on desktop
  if (method === "POST" && path === "/api/auth/logout") {
    return json({ ok: true });
  }

  // GET /api/auth/login/:providerId — mock, redirect straight to home (always logged in)
  if (method === "GET" && path.startsWith("/api/auth/login")) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  return json({ error: "not found" }, 404);
}
