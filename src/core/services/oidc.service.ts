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

const SESSION_TTL  = 7 * 24 * 60 * 60; // 7 days
const OIDC_STATE_TTL = 600;             // 10 minutes

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

    const tokenRes = await fetch(provider.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new ValidationError(`Token exchange failed: ${body}`);
    }

    const tokens = await tokenRes.json() as { access_token: string };

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

    // 4. Upsert user — always "user" role, promote to "admin" manually via UsersService
    await this.db.run(
      `INSERT INTO users (oidc_provider_id, user_id, email, email_verified, name, avatar_url, role)
       VALUES (?, ?, ?, ?, ?, ?, 'user')
       ON CONFLICT(oidc_provider_id, user_id) WHERE oidc_provider_id IS NOT NULL DO UPDATE SET
         email          = excluded.email,
         email_verified = excluded.email_verified,
         name           = excluded.name,
         avatar_url     = excluded.avatar_url,
         updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      providerId,
      userInfo.sub,
      userInfo.email ?? null,
      userInfo.email_verified ? 1 : 0,
      userInfo.name ?? null,
      userInfo.picture ?? null
    );

    const user = await this.db.queryFirst<UserRow>(
      "SELECT * FROM users WHERE oidc_provider_id = ? AND user_id = ?",
      providerId, userInfo.sub
    );

    // 5. Block login for readonly users (e.g. system user)
    if (user!.role === "readonly") {
      throw new ForbiddenError("This account is not allowed to log in");
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

    await this.cache.set<AuthUser>(
      `session:${sessionId}`,
      authUser,
      SESSION_TTL
    );

    return { sessionId, user: user! };
  }

  // ── Session management ─────────────────────────────────────────────────────

  async getSession(sessionId: string): Promise<AuthUser | null> {
    return this.cache.get<AuthUser>(`session:${sessionId}`);
  }

  async renewSession(sessionId: string): Promise<void> {
    const user = await this.cache.get<AuthUser>(`session:${sessionId}`);
    if (user) {
      await this.cache.set(`session:${sessionId}`, user, SESSION_TTL);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.cache.delete(`session:${sessionId}`);
  }

  // ── Provider management (admin only) ──────────────────────────────────────

  async addProvider(data: OidcProviderInput): Promise<OidcProviderRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can manage OIDC providers");

    await this.db.run(
      `INSERT INTO oidc_providers
       (provider, display_name, client_id, client_secret, redirect_uri, auth_url, token_url, userinfo_url, scope, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.provider, data.display_name, data.client_id,
      data.client_secret ?? null, data.redirect_uri,
      data.auth_url, data.token_url, data.userinfo_url,
      data.scope ?? "openid email profile",
      data.enabled !== false ? 1 : 0
    );

    return (await this.db.queryFirst<OidcProviderRow>(
      "SELECT * FROM oidc_providers ORDER BY created_at DESC LIMIT 1"
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
