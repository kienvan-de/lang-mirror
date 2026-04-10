/**
 * Minimal mock OIDC server for local CF development.
 * Runs on port 7843 alongside Wrangler (7842) and Vite (5173).
 *
 * Implements just enough of the OIDC Authorization Code + PKCE flow:
 *   GET  /authorize          — login form (or auto-approve)
 *   POST /token              — code → access_token exchange
 *   GET  /userinfo           — returns user claims
 *   GET  /.well-known/openid-configuration  — discovery document
 *
 * Users are defined in MOCK_USERS below — add as many as you like.
 * Select which user to log in as from the login form.
 */

const PORT = 7843;
const ISSUER = `http://localhost:${PORT}`;

// ── Mock users ────────────────────────────────────────────────────────────────

const MOCK_USERS: Record<string, {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string | null;
  role_hint: string; // informational only — role is set in the app's users table
}> = {
  admin: {
    sub:            "mock-admin-001",
    email:          "admin@mock.local",
    email_verified: true,
    name:           "Mock Admin",
    picture:        null,
    role_hint:      "admin",
  },
  user: {
    sub:            "mock-user-001",
    email:          "user@mock.local",
    email_verified: true,
    name:           "Mock User",
    picture:        null,
    role_hint:      "user",
  },
  user2: {
    sub:            "mock-user-002",
    email:          "user2@mock.local",
    email_verified: true,
    name:           "Mock User 2",
    picture:        null,
    role_hint:      "user",
  },
};

// ── In-memory code store (code → { username, nonce }) ────────────────────────

const codeStore = new Map<string, { username: string; nonce: string }>();
const tokenStore = new Map<string, { username: string }>();

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function loginPage(params: {
  redirect_uri: string;
  state: string;
  nonce: string;
  error?: string;
}): string {
  const userOptions = Object.entries(MOCK_USERS)
    .map(([key, u]) => `<option value="${key}">${u.name} (${u.email}) [${u.role_hint}]</option>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock OIDC Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 32px; width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px; }
    p { font-size: 13px; color: #666; margin-bottom: 24px; }
    label { display: block; font-size: 13px; font-weight: 500; color: #333; margin-bottom: 6px; }
    select { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: white; margin-bottom: 16px; }
    button { width: 100%; padding: 11px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { background: #fee2e2; color: #991b1b; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🧪 DEV — Mock OIDC</div>
    <h1>Sign in</h1>
    <p>Select a mock user to log in as. This server only runs in local development.</p>
    ${params.error ? `<div class="error">${params.error}</div>` : ""}
    <form method="POST" action="/authorize/submit">
      <input type="hidden" name="redirect_uri" value="${params.redirect_uri}">
      <input type="hidden" name="state" value="${params.state}">
      <input type="hidden" name="nonce" value="${params.nonce}">
      <label for="user">Login as</label>
      <select name="username" id="user">
        ${userOptions}
      </select>
      <button type="submit">Continue →</button>
    </form>
  </div>
</body>
</html>`;
}

// ── Request handler ───────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // ── Discovery document ──────────────────────────────────────────────────────
  if (path === "/.well-known/openid-configuration") {
    return json({
      issuer:                 ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint:         `${ISSUER}/token`,
      userinfo_endpoint:      `${ISSUER}/userinfo`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["none"],
      scopes_supported: ["openid", "email", "profile"],
      code_challenge_methods_supported: ["S256", "plain"],
    });
  }

  // ── Authorization endpoint — show login form ────────────────────────────────
  if (method === "GET" && path === "/authorize") {
    const redirect_uri = url.searchParams.get("redirect_uri") ?? "";
    const state        = url.searchParams.get("state") ?? "";
    const nonce        = url.searchParams.get("nonce") ?? "";

    if (!redirect_uri || !state) {
      return new Response("Missing redirect_uri or state", { status: 400 });
    }

    return new Response(loginPage({ redirect_uri, state, nonce }), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // ── Authorization form submit ───────────────────────────────────────────────
  if (method === "POST" && path === "/authorize/submit") {
    const formData    = await req.formData();
    const redirect_uri = formData.get("redirect_uri") as string;
    const state       = formData.get("state") as string;
    const nonce       = formData.get("nonce") as string;
    const username    = formData.get("username") as string;

    if (!MOCK_USERS[username]) {
      return new Response(loginPage({ redirect_uri, state, nonce, error: "Unknown user" }), {
        headers: { "Content-Type": "text/html" },
      });
    }

    const code = randomHex(16);
    codeStore.set(code, { username, nonce });

    // Expire code after 60s
    setTimeout(() => codeStore.delete(code), 60_000);

    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);

    return Response.redirect(callbackUrl.toString(), 302);
  }

  // ── Token endpoint ──────────────────────────────────────────────────────────
  if (method === "POST" && path === "/token") {
    let params: URLSearchParams;
    const ct = req.headers.get("Content-Type") ?? "";

    if (ct.includes("application/json")) {
      const body = await req.json() as Record<string, string>;
      params = new URLSearchParams(body);
    } else {
      const text = await req.text();
      params = new URLSearchParams(text);
    }

    const code       = params.get("code");
    const grant_type = params.get("grant_type");

    if (grant_type !== "authorization_code" || !code) {
      return json({ error: "invalid_request" }, 400);
    }

    const entry = codeStore.get(code);
    if (!entry) {
      return json({ error: "invalid_grant" }, 400);
    }
    codeStore.delete(code);

    const access_token = randomHex(24);
    tokenStore.set(access_token, { username: entry.username });

    // Expire token after 1 hour
    setTimeout(() => tokenStore.delete(access_token), 3_600_000);

    return json({
      access_token,
      token_type:  "Bearer",
      expires_in:  3600,
      scope:       "openid email profile",
    });
  }

  // ── Userinfo endpoint ───────────────────────────────────────────────────────
  if (method === "GET" && path === "/userinfo") {
    const auth   = req.headers.get("Authorization") ?? "";
    const token  = auth.replace(/^Bearer\s+/i, "");
    const entry  = tokenStore.get(token);

    if (!entry) {
      return json({ error: "invalid_token" }, 401);
    }

    const user = MOCK_USERS[entry.username];
    if (!user) return json({ error: "invalid_token" }, 401);

    return json({
      sub:            user.sub,
      email:          user.email,
      email_verified: user.email_verified,
      name:           user.name,
      picture:        user.picture,
    });
  }

  return new Response("Not found", { status: 404 });
}

// ── Start server ──────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`🔐 Mock OIDC server running at ${ISSUER}`);
console.log(`   Discovery: ${ISSUER}/.well-known/openid-configuration`);
console.log(`   Users: ${Object.keys(MOCK_USERS).join(", ")}`);
