import type { IDatabase } from "../ports/db.port";
import type { ICache } from "../ports/cache.port";
import type { OidcProviderRow, PublicOidcProvider, UserRow } from "../db/types";
import type { AuthUser } from "../auth/context";
import { requireAuth, isAdmin } from "../auth/context";
import { NotFoundError, ForbiddenError, ValidationError } from "../errors";
import {
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  generateNonce,
} from "../auth/pkce";

/** Reject URLs pointing at private/internal network ranges to prevent SSRF */
function assertSafeUrl(url: string, field: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    throw new ValidationError(`${field} is not a valid URL`, field);
  }
  if (parsed.protocol !== "https:") {
    throw new ValidationError(`${field} must use HTTPS`, field);
  }
  const host = parsed.hostname.toLowerCase();
  // Block localhost, private IPs, link-local, metadata endpoints
  const blocked = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,           // link-local / AWS metadata
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,     // IPv6 ULA
    /^fe[89ab][0-9a-f]:/i,  // IPv6 link-local
    /metadata\.google\.internal/i,
    /metadata\.azure\.com/i,
  ];
  if (blocked.some(r => r.test(host))) {
    throw new ValidationError(`${field} points to a disallowed host`, field);
  }
}

const SESSION_TTL  = 7 * 24 * 60 * 60; // 7 days
const OIDC_STATE_TTL = 600;             // 10 minutes

/**
 * Minimum interval between session renewals (seconds).
 *
 * renewSession() re-writes the session to KV to refresh its TTL and
 * re-check is_active in D1. Doing this on every request wastes KV writes
 * (free tier: 1,000/day). Instead we embed a `_renewedAt` epoch in the
 * stored value and skip the write if the session was renewed recently.
 */
const RENEW_INTERVAL = 60 * 60; // 1 hour

interface OidcStateEntry {
  providerId: string;
  codeVerifier: string;
  nonce: string;
}

export interface OidcProviderInput {
  provider: string;
  display_name: string;
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
  auth_url: string;
  token_url: string;
  userinfo_url: string;
  scope?: string;
  enabled?: boolean;
}

export class OidcService {
  constructor(
    private db: IDatabase,
    private cache: ICache,
    /** Skip HTTPS + private-IP validation on token_url / userinfo_url.
     *  Set to true only in local development (SKIP_OIDC_URL_VALIDATION env var).
     *  Never enable in production. */
    private skipUrlValidation = false,
    /** Maximum number of active users allowed. New user registration is blocked
     *  when the active user count reaches this limit. Existing users can still
     *  log in. Set via the MAX_USERS env var (default 20). */
    private maxUsers = 20,
  ) {}

  // ── Public provider list (login page) ──────────────────────────────────────

  async listProviders(): Promise<PublicOidcProvider[]> {
    const rows = await this.db.queryAll<OidcProviderRow>(
      "SELECT * FROM oidc_providers WHERE enabled = 1 ORDER BY display_name ASC"
    );
    return rows.map(({ client_secret, client_id, ...pub }) => pub);
  }

  // ── Initiate OIDC login flow ───────────────────────────────────────────────

  async initiateLogin(providerId: string): Promise<{ redirectUrl: string }> {
    const provider = await this.db.queryFirst<OidcProviderRow>(
      "SELECT * FROM oidc_providers WHERE id = ? AND enabled = 1", providerId
    );
    if (!provider) throw new NotFoundError(`OIDC provider '${providerId}' not found or disabled`);

    const state        = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await computeCodeChallenge(codeVerifier);
    const nonce        = generateNonce();

    await this.cache.set<OidcStateEntry>(
      `oidc:state:${state}`,
      { providerId, codeVerifier, nonce },
      OIDC_STATE_TTL
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id:     provider.client_id,
      redirect_uri:  provider.redirect_uri,
      scope:         provider.scope,
      state,
      nonce,
      code_challenge:        codeChallenge,
      code_challenge_method: "S256",
    });

    return { redirectUrl: `${provider.auth_url}?${params.toString()}` };
  }

  // ── Handle OIDC callback ───────────────────────────────────────────────────

  async handleCallback(
    providerId: string,
    code: string,
    state: string
  ): Promise<{ sessionId: string; user: UserRow }> {
    // 1. Validate state
    const stateEntry = await this.cache.get<OidcStateEntry>(`oidc:state:${state}`);
    if (!stateEntry || stateEntry.providerId !== providerId) {
      throw new ValidationError("Invalid or expired state parameter");
    }
    await this.cache.delete(`oidc:state:${state}`);

    const provider = await this.db.queryFirst<OidcProviderRow>(
      "SELECT * FROM oidc_providers WHERE id = ?", providerId
    );
    if (!provider) throw new NotFoundError(`OIDC provider '${providerId}' not found`);

    // 2. Exchange code for tokens
    const tokenParams: Record<string, string> = {
      grant_type:    "authorization_code",
      code,
      redirect_uri:  provider.redirect_uri,
      client_id:     provider.client_id,
      code_verifier: stateEntry.codeVerifier,
    };
    if (provider.client_secret) {
      tokenParams["client_secret"] = provider.client_secret;
    }

    if (!this.skipUrlValidation) {
      assertSafeUrl(provider.token_url, "token_url");
      assertSafeUrl(provider.userinfo_url, "userinfo_url");
    }

    const tokenRes = await fetch(provider.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenRes.ok) {
      // Do NOT expose the raw error body to the client — log server-side only
      console.error(`[oidc] Token exchange failed: HTTP ${tokenRes.status} from ${provider.token_url}`);
      throw new ValidationError("Token exchange failed");
    }

    const tokens = await tokenRes.json() as { access_token: string; id_token?: string };

    // Validate nonce from ID token to prevent replay attacks
    if (!tokens.id_token) {
      console.warn("[oidc] No id_token in token response — nonce validation skipped. Consider requiring 'openid' scope.");
    }
    if (tokens.id_token) {
      try {
        // JWT payload is the second base64url segment (no signature verification needed for nonce check
        // since the token came directly from the token endpoint over HTTPS)
        const payloadB64 = tokens.id_token.split(".")[1] ?? "";
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
        if (payload["nonce"] !== stateEntry.nonce) {
          throw new ValidationError("Nonce mismatch — possible replay attack");
        }
      } catch (e) {
        if (e instanceof ValidationError) throw e;
        // id_token parsing failed — non-fatal, log and continue
        console.warn("[oidc] Could not parse id_token for nonce validation:", e);
      }
    }

    // 3. Get user info
    const userInfoRes = await fetch(provider.userinfo_url, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) throw new ValidationError("Failed to fetch user info");

    const userInfo = await userInfoRes.json() as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    // 4. Check if this is a new user and enforce the registration limit.
    //    Existing users can always log in — only block brand-new registrations.
    const existingUser = await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE oidc_provider_id = ? AND user_id = ?",
      providerId, userInfo.sub,
    );

    if (!existingUser) {
      // Count active users (excluding system user) to enforce MAX_USERS limit
      const { count } = (await this.db.queryFirst<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND id != 'system'",
      ))!;
      if (count >= this.maxUsers) {
        throw new ForbiddenError(
          "REGISTRATION_CLOSED:Registration is currently closed. Please contact support@langmirror.today for access.",
        );
      }
    }

    // 5. Upsert user — always "user" role, promote to "admin" manually via UsersService
    await this.db.run(
      `INSERT INTO users (id, oidc_provider_id, user_id, email, email_verified, name, avatar_url, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
       ON CONFLICT(oidc_provider_id, user_id) WHERE oidc_provider_id IS NOT NULL DO UPDATE SET
         email          = excluded.email,
         email_verified = excluded.email_verified,
         name           = excluded.name,
         avatar_url     = excluded.avatar_url,
         updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      crypto.randomUUID(),
      providerId,
      userInfo.sub,
      userInfo.email ?? null,
      userInfo.email_verified ? 1 : 0,
      userInfo.name ?? null,
      userInfo.picture ?? null,
    );

    const user = await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE oidc_provider_id = ? AND user_id = ?",
      providerId, userInfo.sub,
    );

    // 5. Block login for readonly users (e.g. system user)
    if (user!.role === "readonly") {
      throw new ForbiddenError("This account is not allowed to log in");
    }

    // 6. Block login for deactivated users
    if (user!.is_active === 0) {
      const reason = user!.deactivation_reason ?? "";
      throw new ForbiddenError(`DEACTIVATED:${reason}`);
    }

    // 6. Create session
    const sessionId = crypto.randomUUID();
    const authUser: AuthUser = {
      isAnonymous: false,
      id:        user!.id,
      userId:    user!.user_id,
      email:     user!.email ?? "",
      name:      user!.name ?? "",
      avatarUrl: user!.avatar_url,
      role:      user!.role,
    };

    await this.cache.set(
      `session:${sessionId}`,
      { ...authUser, _renewedAt: Math.floor(Date.now() / 1000) },
      SESSION_TTL
    );

    // Reverse mapping: userId → sessionId, so deactivateUser can
    // invalidate the session without scanning all KV keys.
    await this.cache.set(`user-session:${authUser.id}`, sessionId, SESSION_TTL);

    return { sessionId, user: user! };
  }

  // ── Session management ─────────────────────────────────────────────────────

  async getSession(sessionId: string): Promise<AuthUser | null> {
    return this.cache.get<AuthUser>(`session:${sessionId}`);
  }

  /**
   * Renew a session's TTL in KV.
   *
   * Accepts the already-fetched user to avoid a redundant KV read.
   * Skips the KV write if the session was renewed less than RENEW_INTERVAL
   * seconds ago — this is the main KV write savings.
   *
   * User deactivation is handled eagerly by invalidateUserSessions()
   * (called from the deactivate endpoint), so no D1 check is needed here.
   */
  async renewSession(sessionId: string, cachedUser?: AuthUser): Promise<void> {
    const user = cachedUser ?? await this.cache.get<AuthUser>(`session:${sessionId}`);
    if (!user) return;

    // Skip renewal if session was renewed recently (saves 1 KV write per request)
    const renewedAt = (user as AuthUser & { _renewedAt?: number })._renewedAt ?? 0;
    if (Date.now() / 1000 - renewedAt < RENEW_INTERVAL) return;

    await this.cache.set(`session:${sessionId}`, { ...user, _renewedAt: Math.floor(Date.now() / 1000) }, SESSION_TTL);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.cache.delete(`session:${sessionId}`);
  }

  /**
   * Invalidate all sessions for a user (called on admin deactivation).
   * Uses the reverse mapping written at login to find the session ID.
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    const sessionId = await this.cache.get<string>(`user-session:${userId}`);
    if (sessionId) {
      await this.cache.delete(`session:${sessionId}`);
      await this.cache.delete(`user-session:${userId}`);
    }
  }

  // ── Provider management (admin only) ──────────────────────────────────────

  async addProvider(data: OidcProviderInput): Promise<OidcProviderRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can manage OIDC providers");

    const id = crypto.randomUUID();
    await this.db.run(
      `INSERT INTO oidc_providers
       (id, provider, display_name, client_id, client_secret, redirect_uri, auth_url, token_url, userinfo_url, scope, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.provider, data.display_name, data.client_id,
      data.client_secret ?? null, data.redirect_uri,
      data.auth_url, data.token_url, data.userinfo_url,
      data.scope ?? "openid email profile",
      data.enabled !== false ? 1 : 0
    );

    return (await this.db.queryFirst<OidcProviderRow>(
      "SELECT * FROM oidc_providers WHERE id = ?", id
    ))!;
  }

  async updateProvider(id: string, data: Partial<OidcProviderInput>): Promise<OidcProviderRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can manage OIDC providers");

    const existing = await this.db.queryFirst<OidcProviderRow>(
      "SELECT * FROM oidc_providers WHERE id = ?", id
    );
    if (!existing) throw new NotFoundError(`OIDC provider '${id}' not found`);

    await this.db.run(
      `UPDATE oidc_providers SET
         provider     = ?, display_name = ?, client_id   = ?, client_secret = ?,
         redirect_uri = ?, auth_url     = ?, token_url   = ?, userinfo_url  = ?,
         scope        = ?, enabled      = ?
       WHERE id = ?`,
      data.provider      ?? existing.provider,
      data.display_name  ?? existing.display_name,
      data.client_id     ?? existing.client_id,
      data.client_secret !== undefined ? data.client_secret ?? null : existing.client_secret,
      data.redirect_uri  ?? existing.redirect_uri,
      data.auth_url      ?? existing.auth_url,
      data.token_url     ?? existing.token_url,
      data.userinfo_url  ?? existing.userinfo_url,
      data.scope         ?? existing.scope,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
      id
    );

    return (await this.db.queryFirst<OidcProviderRow>(
      "SELECT * FROM oidc_providers WHERE id = ?", id
    ))!;
  }

  async deleteProvider(id: string): Promise<void> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can manage OIDC providers");
    const existing = await this.db.queryFirst(
      "SELECT id FROM oidc_providers WHERE id = ?", id
    );
    if (!existing) throw new NotFoundError(`OIDC provider '${id}' not found`);
    await this.db.run("DELETE FROM oidc_providers WHERE id = ?", id);
  }
}
