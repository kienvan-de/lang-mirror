/**
 * Auth wrapper around routeAgentRequest.
 *
 * Flow:
 *   1. Browser opens WebSocket to /agents/chat-agent/default
 *      → HttpOnly cookie attached automatically (same origin)
 *   2. This wrapper intercepts, parses session cookie from headers
 *   3. Resolves user via OidcService.getSession() — 1 KV read
 *   4. Rejects unauthenticated requests with 401
 *   5. Strips any client-sent X-Agent-Auth header (security)
 *   6. Rewrites URL: /agents/chat-agent/default → /agents/chat-agent/{userId}
 *   7. Sets X-Agent-Auth header with JSON-serialized AuthUser
 *   8. Forwards to routeAgentRequest() → DO instance named by userId
 *
 * Result: each user gets their own DO instance with persistent chat history,
 * without the client ever knowing or sending any identity info.
 */
import { routeAgentRequest } from "agents";
import { OidcService } from "../../core/services/oidc.service";
import { D1Adapter } from "../adapters/db.adapter";
import { KVCacheAdapter } from "../adapters/cache.adapter";
import type { Env } from "../types";

export async function routeAuthenticatedAgent(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  // Only handle /agents/* paths
  if (!url.pathname.startsWith("/agents/")) return null;



  // ── Parse session cookie ─────────────────────────────────
  const isSecure = url.protocol === "https:";
  const cookieName = isSecure ? "__Host-session" : "session";
  const cookies = request.headers.get("Cookie") ?? "";
  const sessionId = parseCookie(cookies, cookieName);

  if (!sessionId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Resolve authenticated user from KV (1 read) ─────────
  const skipValidation =
    env.SKIP_OIDC_URL_VALIDATION === "true" && !isSecure;
  const oidc = new OidcService(
    new D1Adapter(env.DB),
    new KVCacheAdapter(env.SESSION_CACHE),
    skipValidation,
  );
  const user = await oidc.getSession(sessionId);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Rewrite DO instance name to userId ───────────────────
  // Client sends: /agents/chat-agent/default  (useAgent with no name)
  // We rewrite to: /agents/chat-agent/{userId}
  const segments = url.pathname.split("/").filter(Boolean);
  // segments: ["agents", "chat-agent", "default"]
  if (segments.length >= 3) {
    segments[2] = user.id;
  } else if (segments.length === 2) {
    segments.push(user.id);
  }
  url.pathname = "/" + segments.join("/");



  // ── Build new request with auth header ───────────────────
  // Clone headers, strip any client-sent auth header, inject verified user
  const headers = new Headers(request.headers);
  headers.delete("X-Agent-Auth");
  headers.set("X-Agent-Auth", JSON.stringify(user));

  const rewritten = new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error — CF Workers support duplex on Request constructor
    duplex: request.body ? "half" : undefined,
  });

  return routeAgentRequest(rewritten, env);
}

/** Simple cookie parser — no dependency on Hono */
function parseCookie(header: string, name: string): string | null {
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${escapeRegExp(name)}=([^;]*)`)
  );
  return match?.[1] ?? null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
