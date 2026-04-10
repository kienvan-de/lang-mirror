# Epic 12 — Authentication & Multi-tenancy (OIDC + Per-user Data)

**Phase:** Auth (prerequisite for public CF deployment)
**Goal:** Add OIDC-based authentication (Google, GitHub, etc.), per-user data isolation,
role-based access control, and a login UI. The desktop server gets a mock/bypass mode
so local dev stays frictionless.
**Depends on:** Epic 10 (shared core + Hono), Epic 11 scaffold

---

## Design Decisions & Gap Analysis

### 1. Identity model
- **One user = one row in `users`**, linked to one OIDC provider via `oidc_id` (the
  provider config, not the user's sub claim — `oidc_id` in `users` should be renamed
  `oidc_provider_id` to avoid confusion with the OIDC `sub` claim).
- Users authenticate via an OIDC provider. On first login, a `users` row is created.
  On subsequent logins the row is updated (name, avatar, email_verified may change).
- `user_id` in `users` stores the OIDC `sub` claim (unique per provider).
  A composite unique key `(oidc_provider_id, user_id)` prevents cross-provider collisions.

### 2. Roles
- Two roles: `"user"` and `"admin"`.
- First user to complete OIDC login becomes `"admin"` (bootstrap).
- Admins can promote other users via the users management API.
- Desktop mock user always has `"admin"` role.

### 3. Owner columns
- `topics.owner_id` → FK to `users.id` — can be NULL for legacy/system content.
- `practice_attempts.owner_id` → FK to `users.id`.
- `settings` keeps composite PK `(key, owner_id)` — NULL `owner_id` = system default.
  User settings shadow system defaults: `COALESCE(user_setting, system_setting)`.

### 4. Session / cache
- After OIDC callback, create a **session** stored in the `ICache` port.
- Session key: random UUID (`session_id`), value: `{ userId, role, email, name, avatarUrl }`.
- Session TTL: 7 days (rolling).
- Delivered as `Set-Cookie: session=<session_id>; HttpOnly; SameSite=Lax; Secure` (CF)
  or without `Secure` on desktop.
- Worker middleware reads `Cookie: session=<id>`, looks up in cache, sets `AsyncLocalStorage`.

### 5. OIDC flow (PKCE)
- Use **Authorization Code Flow + PKCE** (no client secret needed for public clients, but
  we store `client_secret` for confidential clients like GitHub Apps).
- State + code_verifier + nonce stored in `ICache` with 10-minute TTL (keyed by `state`).
- Redirect URI format: `https://{domain}/api/auth/callback/{providerId}`

### 6. AsyncLocalStorage
- `src/core/auth/context.ts` exports:
  - `AuthContext` type: `{ userId: string; role: "user" | "admin"; email: string; name: string; avatarUrl: string | null; isAnonymous: false } | { isAnonymous: true }`
  - `authStorage: AsyncLocalStorage<AuthContext>`
  - `getAuth(): AuthContext` — throws `UnauthorizedError` if anonymous
  - `runWithAuth(ctx, fn)` — wraps execution with context (called by server/worker)
- Services call `getAuth()` — never receive user as a parameter.

### 7. Desktop mock
- `src/server/lib/auth-mock.ts` — wraps every request with a fixed admin context.
- No OIDC routes on desktop; `/api/auth/*` returns mock session immediately.
- The mock user has a fixed ID (`"desktop-admin"`) so owner checks pass.

### 8. UI auth flow
- Client stores session in an `HttpOnly` cookie (server-side) — not localStorage.
- React Query `useAuth()` hook calls `GET /api/auth/me` on mount.
- If response is 401 → redirect to `/login`.
- `/login` page lists OIDC providers from `GET /api/auth/providers`.
- After OIDC callback, server sets cookie and redirects to `/?login=success`.

---

## Schema Changes

### New table: `oidc_providers`
```sql
CREATE TABLE IF NOT EXISTS oidc_providers (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  provider      TEXT NOT NULL,         -- "google" | "github" | "generic"
  display_name  TEXT NOT NULL,         -- shown on login button
  client_id     TEXT NOT NULL,
  client_secret TEXT,                  -- NULL for PKCE-only public clients
  redirect_uri  TEXT NOT NULL,
  auth_url      TEXT NOT NULL,         -- authorization endpoint
  token_url     TEXT NOT NULL,         -- token endpoint
  userinfo_url  TEXT NOT NULL,         -- userinfo endpoint
  scope         TEXT NOT NULL DEFAULT 'openid email profile',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

### New table: `users`
```sql
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  oidc_provider_id  TEXT NOT NULL REFERENCES oidc_providers(id) ON DELETE RESTRICT,
  user_id           TEXT NOT NULL,     -- OIDC sub claim
  email             TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  name              TEXT,
  avatar_url        TEXT,
  role              TEXT NOT NULL DEFAULT 'user',   -- "user" | "admin"
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(oidc_provider_id, user_id)   -- same sub can't exist twice per provider
);
```

### Altered tables
```sql
-- topics: add owner (NULL = system/public content)
ALTER TABLE topics ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- practice_attempts: add owner
ALTER TABLE practice_attempts ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- settings: change from (key TEXT PRIMARY KEY) to composite PK
-- SQLite cannot ALTER PRIMARY KEY — this requires a migration with table recreation
-- New shape: key + owner_id (NULL = system default)
CREATE TABLE IF NOT EXISTS settings_new (
  key        TEXT NOT NULL,
  owner_id   TEXT REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (key, owner_id)
);
```

### New indexes
```sql
CREATE INDEX IF NOT EXISTS idx_users_oidc     ON users(oidc_provider_id, user_id);
CREATE INDEX IF NOT EXISTS idx_topics_owner   ON topics(owner_id);
CREATE INDEX IF NOT EXISTS idx_attempts_owner ON practice_attempts(owner_id);
CREATE INDEX IF NOT EXISTS idx_settings_owner ON settings(owner_id);
```

---

## New Port: `ICache`

```typescript
// src/core/ports/cache.port.ts
export interface ICache {
  /** Get a value by key. Returns null if not found or expired. */
  get<T>(key: string): Promise<T | null>;
  /** Set a value with optional TTL in seconds */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Delete a key */
  delete(key: string): Promise<void>;
}
```

Implementations:
- `src/server/adapters/cache.adapter.ts` — in-memory `Map` with TTL (desktop)
- `src/worker/adapters/cache.adapter.ts` — Cloudflare KV (`KVNamespace`)

---

## US-12.1 — Schema Migration

**Phase:** Auth-1
**As a** developer,
**I want** the new tables and columns added to the schema,
**So that** the data model supports users and ownership.

### Tasks
- Update `src/core/db/schema.ts`:
  - Add `oidc_providers` table DDL
  - Add `users` table DDL
  - Add `ALTER TABLE topics ADD COLUMN owner_id` (via `CREATE TABLE IF NOT EXISTS` pattern — safe for new installs)
  - Add `ALTER TABLE practice_attempts ADD COLUMN owner_id`
  - Recreate `settings` table with composite PK (migration handles data transfer)
  - Add all new indexes
- Update `src/core/db/types.ts`:
  - Add `OidcProviderRow`, `UserRow` interfaces
  - Update `TopicRow`, `PracticeAttemptRow`, `SettingRow` with `owner_id`
- Add `migrations/0002_auth_schema.sql` — Wrangler D1 migration file matching the DDL changes
- Update `src/core/db/migrations.ts` to handle:
  - `ALTER TABLE` wrapped in `IF NOT EXISTS` column check (SQLite: check `PRAGMA table_info`)
  - Settings table recreation with data transfer

### Acceptance Criteria
- [ ] `bun run cf:migrate` applies migration with no errors on fresh DB
- [ ] `bun run cf:migrate` is idempotent (safe to run twice)
- [ ] `bun run dev` starts and existing features work (owner_id is nullable — backward compatible)
- [ ] `tsc -p tsconfig.server.json --noEmit` and `tsconfig.worker.json --noEmit` pass

---

## US-12.2 — Auth Context (AsyncLocalStorage)

**Phase:** Auth-1
**As a** developer,
**I want** a platform-agnostic way to access the current user in any service method,
**So that** services never need to accept `userId` as a parameter.

### `src/core/auth/context.ts`
```typescript
import { AsyncLocalStorage } from "async_hooks";

export type AuthUser = {
  isAnonymous: false;
  id: string;           // users.id (internal UUID)
  userId: string;       // OIDC sub claim
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "user" | "admin";
};

export type AuthAnonymous = { isAnonymous: true };
export type AuthContext = AuthUser | AuthAnonymous;

export const authStorage = new AsyncLocalStorage<AuthContext>();

/** Returns the current auth context. Never throws. */
export function getAuthContext(): AuthContext {
  return authStorage.getStore() ?? { isAnonymous: true };
}

/** Returns the authenticated user or throws UnauthorizedError */
export function requireAuth(): AuthUser {
  const ctx = getAuthContext();
  if (ctx.isAnonymous) throw new UnauthorizedError("Authentication required");
  return ctx;
}

/** Returns true if the current user has admin role */
export function isAdmin(): boolean {
  const ctx = getAuthContext();
  return !ctx.isAnonymous && ctx.role === "admin";
}

/**
 * Run a function with the given auth context in AsyncLocalStorage.
 * Called by server/worker middleware — not by services directly.
 */
export function runWithAuth<T>(ctx: AuthContext, fn: () => Promise<T>): Promise<T> {
  return authStorage.run(ctx, fn);
}
```

### `src/core/errors.ts` additions
```typescript
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") { super(message); this.name = "UnauthorizedError"; }
}
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") { super(message); this.name = "ForbiddenError"; }
}
```

### Acceptance Criteria
- [ ] `getAuthContext()` returns anonymous when called outside any request context
- [ ] `runWithAuth(ctx, fn)` correctly scopes the context to the async call chain
- [ ] Services calling `requireAuth()` throw `UnauthorizedError` when anonymous
- [ ] `AsyncLocalStorage` works in both Bun and CF Workers runtimes

---

## US-12.3 — ICache Port + Adapters

**Phase:** Auth-1
**As a** developer,
**I want** a cache port for storing short-lived data (OIDC state, sessions),
**So that** the OIDC service has no platform-specific I/O.

### `src/core/ports/cache.port.ts`
```typescript
export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

### `src/server/adapters/cache.adapter.ts` — `MemoryCacheAdapter`
```typescript
export class MemoryCacheAdapter implements ICache {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value as T;
  }
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }
  async delete(key: string): Promise<void> { this.store.delete(key); }
}
```

### `src/worker/adapters/cache.adapter.ts` — `KVCacheAdapter`
```typescript
export class KVCacheAdapter implements ICache {
  constructor(private kv: KVNamespace) {}
  async get<T>(key: string): Promise<T | null> {
    const val = await this.kv.get(key, "json");
    return val as T | null;
  }
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
  }
  async delete(key: string): Promise<void> { await this.kv.delete(key); }
}
```

### `wrangler.jsonc` addition
```jsonc
{
  "kv_namespaces": [
    { "binding": "SESSION_CACHE", "id": "placeholder-fill-after-wrangler-kv-create" }
  ]
}
```

### Acceptance Criteria
- [ ] `MemoryCacheAdapter` respects TTL — expired entries return null
- [ ] `KVCacheAdapter` round-trips JSON correctly
- [ ] Both implement `ICache` — type-check passes

---

## US-12.4 — OIDC Service

**Phase:** Auth-2
**As a** user,
**I want** to log in via an OIDC provider (Google, GitHub),
**So that** my data is isolated from other users.

### `src/core/services/oidc.service.ts`

```typescript
export class OidcService {
  constructor(
    private db: IDatabase,
    private cache: ICache,
  ) {}

  /** List enabled providers (for login page buttons) — public, no auth */
  async listProviders(): Promise<PublicOidcProvider[]>

  /**
   * Kick off OIDC flow.
   * - Validates providerId exists and is enabled
   * - Generates state (random 32-byte hex), code_verifier, nonce
   * - Stores { providerId, code_verifier, nonce } under key "oidc:state:{state}" with 10-min TTL
   * - Builds authorization URL with PKCE (code_challenge = S256(code_verifier))
   * - Returns { redirectUrl }
   */
  async initiateLogin(providerId: string): Promise<{ redirectUrl: string }>

  /**
   * Handle OIDC callback (redirect from provider).
   * - Validates state param → looks up in cache → retrieves code_verifier, nonce
   * - Exchanges code for tokens (POST to token_url with code_verifier)
   * - Validates id_token (nonce check, expiry) OR calls userinfo_url
   * - Upserts user: INSERT OR REPLACE with sub, email, name, picture
   * - First user ever → set role = "admin" (bootstrap)
   * - Creates session: generates session_id, stores AuthUser in cache with 7-day TTL
   * - Returns { sessionId, user }
   */
  async handleCallback(providerId: string, code: string, state: string): Promise<{ sessionId: string; user: UserRow }>

  /**
   * Validate a session and return the AuthUser.
   * Used by middleware. Returns null if not found or expired.
   */
  async getSession(sessionId: string): Promise<AuthUser | null>

  /** Invalidate a session (logout) */
  async deleteSession(sessionId: string): Promise<void>

  /** Add a new OIDC provider — admin only */
  async addProvider(data: OidcProviderInput): Promise<OidcProviderRow>

  /** Update an OIDC provider — admin only */
  async updateProvider(id: string, data: Partial<OidcProviderInput>): Promise<OidcProviderRow>

  /** Delete an OIDC provider — admin only */
  async deleteProvider(id: string): Promise<void>
}
```

### PKCE helpers (pure functions, no I/O — in `src/core/auth/pkce.ts`)
```typescript
export async function generateCodeVerifier(): Promise<string>  // 43-128 char base64url string
export async function computeCodeChallenge(verifier: string): Promise<string>  // S256 = base64url(SHA256(verifier))
export function generateState(): string        // crypto.randomUUID()
export function generateNonce(): string        // crypto.randomUUID()
```
All use `globalThis.crypto` — works in Bun, CF Workers, and browsers.

### Session key format
- OIDC state: `"oidc:state:{state}"` — TTL 600s
- Session: `"session:{sessionId}"` — TTL 604800s (7 days)

### Acceptance Criteria
- [ ] `listProviders()` returns only enabled providers, omitting `client_secret`
- [ ] `initiateLogin()` returns a valid OAuth2 authorization URL with PKCE params
- [ ] `handleCallback()` exchanges code, upserts user, creates session
- [ ] First-ever user gets `role = "admin"` automatically
- [ ] `getSession()` returns null for expired/missing sessions
- [ ] `addProvider()` throws `ForbiddenError` if caller is not admin

---

## US-12.5 — Users Service

**Phase:** Auth-2
**As a** user,
**I want** to view my profile and (admin) manage other users,
**So that** user data is accessible and controllable.

### `src/core/services/users.service.ts`
```typescript
export class UsersService {
  constructor(private db: IDatabase) {}

  /** Get the currently logged-in user's profile — requires auth */
  async getMe(): Promise<UserRow>

  /** List all users — admin only */
  async listUsers(): Promise<UserRow[]>

  /** Get a user by internal ID — admin only */
  async getUserById(id: string): Promise<UserRow>

  /** Update a user's role — admin only, cannot demote self */
  async updateRole(id: string, role: "user" | "admin"): Promise<UserRow>

  /** Delete a user — admin only, cannot delete self */
  async deleteUser(id: string): Promise<void>
}
```

### Acceptance Criteria
- [ ] `getMe()` throws `UnauthorizedError` if anonymous
- [ ] `listUsers()` throws `ForbiddenError` if not admin
- [ ] `updateRole()` throws `ForbiddenError` if trying to demote self

---

## US-12.6 — Update Existing Services for Ownership

**Phase:** Auth-2
**As a** developer,
**I want** existing services to enforce ownership and role rules,
**So that** user data is properly isolated.

### Topics (`topics.service.ts`)
```
list()         → return own topics + topics with owner_id = NULL (public/system)
get()          → allowed if owner OR admin OR owner_id = NULL
create()       → sets owner_id = requireAuth().id
update()       → requires auth; owner or admin only
delete()       → requires auth; owner or admin only
```

### VersionsService
```
create/update/delete  → topic must be owned by current user or user is admin
```

### SentencesService
```
update/delete → topic must be owned by current user or user is admin
```

### PracticeService
```
logAttempt()   → sets owner_id = requireAuth().id
getDailyStats / getStreak / getRecent / getCalendar
               → filter by owner_id = requireAuth().id
```

### SettingsService
```
getAll()   → COALESCE(user_setting.value, system_setting.value)
             Returns merged map: system defaults overridden by user's own settings
get(key)   → same COALESCE lookup
set(key)   → owner_id = requireAuth().id (user setting)
setSystem(key) → owner_id = NULL (admin only)
```
```sql
-- Query for getAll():
SELECT
  s.key,
  COALESCE(u.value, s.value) as value
FROM settings s
LEFT JOIN settings u ON u.key = s.key AND u.owner_id = ?  -- current user id
WHERE s.owner_id IS NULL  -- start from system defaults
```

### ImportService
```
importLesson() → sets owner_id = requireAuth().id on created topics
```

### Acceptance Criteria
- [ ] Topics list returns only own + public topics (not other users' topics)
- [ ] Creating a topic sets `owner_id` to current user
- [ ] Practice stats only show current user's attempts
- [ ] User settings shadow system defaults correctly
- [ ] Admin can access any topic

---

## US-12.7 — Desktop Mock Auth

**Phase:** Auth-2 (desktop only)
**As a** developer,
**I want** the desktop server to bypass OIDC and inject a mock admin user,
**So that** local development works without any auth setup.

### `src/server/lib/auth-mock.ts`
```typescript
import { runWithAuth, type AuthUser } from "../../core/auth/context";

export const MOCK_ADMIN: AuthUser = {
  isAnonymous: false,
  id: "desktop-admin",
  userId: "desktop-admin",
  email: "admin@localhost",
  name: "Desktop Admin",
  avatarUrl: null,
  role: "admin",
};

/** Wrap a request handler with the mock admin context */
export function withMockAuth<T>(fn: () => Promise<T>): Promise<T> {
  return runWithAuth(MOCK_ADMIN, fn);
}
```

### `src/server/router.ts` update
```typescript
// Wrap every handle() call:
return withMockAuth(() => topics.handle(req, url));
```

### Mock OIDC endpoints
- `GET /api/auth/me` → returns `MOCK_ADMIN` directly (always logged in)
- `GET /api/auth/providers` → returns `[]` (no providers on desktop)
- `POST /api/auth/logout` → returns `{ ok: true }` (no-op)

### Acceptance Criteria
- [ ] `bun run dev` — all routes work without any login prompt
- [ ] `GET /api/auth/me` returns mock admin user
- [ ] `requireAuth()` in services never throws on desktop
- [ ] `isAdmin()` always returns true on desktop

---

## US-12.8 — Worker Auth Middleware + Routes

**Phase:** Auth-3
**As a** developer,
**I want** the CF Worker to validate sessions and set the auth context,
**So that** Hono routes are protected and services have access to the current user.

### Middleware: `src/worker/hono/middleware/auth.ts`
```typescript
import { createMiddleware } from "hono/factory";
import { runWithAuth } from "../../../core/auth/context";
import { OidcService } from "../../../core/services/oidc.service";
import { D1Adapter } from "../../adapters/db.adapter";
import { KVCacheAdapter } from "../../adapters/cache.adapter";

export const authMiddleware = createMiddleware(async (c, next) => {
  const sessionId = getCookie(c, "session");
  if (sessionId) {
    const oidcSvc = new OidcService(new D1Adapter(c.env.DB), new KVCacheAdapter(c.env.SESSION_CACHE));
    const user = await oidcSvc.getSession(sessionId);
    if (user) {
      // Renew rolling session TTL
      await oidcSvc.renewSession(sessionId);
      return runWithAuth(user, () => next());
    }
  }
  // Not logged in — run as anonymous
  return runWithAuth({ isAnonymous: true }, () => next());
});
```

### Auth routes: `src/worker/hono/auth.ts`
```typescript
export const authRouter = new Hono<{ Bindings: Env }>();

// GET /api/auth/me — returns current user or 401
authRouter.get("/me", async (c) => { ... })

// GET /api/auth/providers — public, lists enabled OIDC providers
authRouter.get("/providers", async (c) => { ... })

// POST /api/auth/login/:providerId — kick off OIDC flow, returns { redirectUrl }
authRouter.post("/login/:providerId", async (c) => { ... })

// GET /api/auth/callback/:providerId — OIDC redirect, sets cookie, redirects to /
authRouter.get("/callback/:providerId", async (c) => {
  // ... handle callback, set cookie
  return c.redirect("/?login=success");
})

// POST /api/auth/logout — clears session cookie
authRouter.post("/logout", async (c) => { ... })
```

### Users routes: `src/worker/hono/users.ts`
```typescript
export const usersRouter = new Hono<{ Bindings: Env }>();

usersRouter.get("/me", async (c) => { ... })       // GET /api/users/me
usersRouter.get("/",   async (c) => { ... })       // GET /api/users (admin)
usersRouter.put("/:id/role", async (c) => { ... }) // PUT /api/users/:id/role (admin)
usersRouter.delete("/:id", async (c) => { ... })   // DELETE /api/users/:id (admin)
```

### `src/worker/hono/app.ts` updates
```typescript
// Add SESSION_CACHE to Env
app.use("/api/*", authMiddleware);

// Add error handler for new error types
if (err instanceof UnauthorizedError) return c.json({ error: err.message }, 401);
if (err instanceof ForbiddenError)    return c.json({ error: err.message }, 403);

app.route("/api/auth",  authRouter);
app.route("/api/users", usersRouter);
```

### `src/worker/types.ts` update
```typescript
export interface Env {
  DB: D1Database;
  TTS_CACHE: R2Bucket;
  RECORDINGS: R2Bucket;
  SESSION_CACHE: KVNamespace;   // ← new
}
```

### Acceptance Criteria
- [ ] Requests with valid session cookie → `requireAuth()` works in services
- [ ] Requests without cookie → `getAuthContext().isAnonymous === true`
- [ ] `GET /api/auth/me` with valid session → returns user JSON
- [ ] `GET /api/auth/me` without session → 401
- [ ] `POST /api/auth/login/:providerId` → returns `{ redirectUrl }` with PKCE params
- [ ] `GET /api/auth/callback/:providerId` → sets `session` cookie, redirects to `/`
- [ ] `POST /api/auth/logout` → deletes session from KV, clears cookie

---

## US-12.9 — UI: Login Page & Auth Protection

**Phase:** Auth-3 (UI)
**As a** user,
**I want** a login page and protected routes,
**So that** I can authenticate before accessing the app.

### New hook: `src/client/hooks/useAuth.ts`
```typescript
export interface AuthUser {
  id: string; email: string; name: string;
  avatarUrl: string | null; role: "user" | "admin";
}

export function useAuth(): {
  user: AuthUser | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  logout: () => Promise<void>;
}
```
- Calls `GET /api/auth/me` via TanStack Query
- `401` response → `user = null`

### New page: `src/client/routes/login.tsx`
- Calls `GET /api/auth/providers` to list providers
- Renders one button per provider: `🔑 Login with {provider.display_name}`
- On click: `POST /api/auth/login/{providerId}` → redirect to `redirectUrl`
- Shows "No providers configured" if list is empty (desktop)
- Shows spinner while loading providers

### Route protection: `src/client/RootLayout.tsx`
```typescript
// In RootLayout, check useAuth():
const { user, isLoading } = useAuth();
if (!isLoading && !user) {
  return <Navigate to="/login" />;
}
```

### User badge: `src/client/RootLayout.tsx` top-right
```tsx
<div className="flex items-center gap-2">
  {user.avatarUrl && <img src={user.avatarUrl} className="w-7 h-7 rounded-full" />}
  <span className="text-sm font-medium">{user.name}</span>
  <button onClick={logout} className="text-xs text-gray-500">Logout</button>
</div>
```

### Router update: `src/client/router.tsx`
```typescript
// Add /login route (no auth required)
export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
```

### `src/client/lib/api.ts` additions
```typescript
getMe: () => apiFetch<AuthUser>("/auth/me"),
getProviders: () => apiFetch<OidcProvider[]>("/auth/providers"),
initiateLogin: (providerId: string) => apiFetch<{ redirectUrl: string }>(`/auth/login/${providerId}`, { method: "POST" }),
logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
```

### Acceptance Criteria
- [ ] Unauthenticated users on any protected route → redirect to `/login`
- [ ] `/login` page shows provider buttons from `GET /api/auth/providers`
- [ ] Clicking provider button → browser redirects to OIDC authorization URL
- [ ] After successful login → redirected to `/`, user badge visible
- [ ] Logout button clears session, redirects to `/login`
- [ ] Desktop: no redirect to `/login` (mock user always active — `GET /api/auth/me` always 200)

---

## Implementation Order

```
US-12.1  Schema migration          (unblocks everything — do first)
  ↓
US-12.2  Auth context (AsyncLocalStorage + errors)
US-12.3  ICache port + adapters
  ↓
US-12.4  OIDC service              US-12.5  Users service
  ↓                                    ↓
US-12.6  Update existing services for ownership
  ↓
US-12.7  Desktop mock auth         US-12.8  Worker middleware + routes
  ↓                                    ↓
US-12.9  UI: login page + protection + user badge
```

---

## Summary

| Story | What | Effort |
|-------|------|--------|
| US-12.1 — Schema migration | `oidc_providers`, `users` tables; `owner_id` columns | Medium (1 day) |
| US-12.2 — Auth context | `AsyncLocalStorage`, `requireAuth()`, `runWithAuth()` | Small (2–3h) |
| US-12.3 — ICache port + adapters | `MemoryCacheAdapter` (desktop), `KVCacheAdapter` (CF) | Small (2–3h) |
| US-12.4 — OIDC service | Full PKCE flow, session management | Large (2 days) |
| US-12.5 — Users service | Profile, list, role management | Small (half day) |
| US-12.6 — Ownership in existing services | Topics, practice, settings, import | Medium (1–2 days) |
| US-12.7 — Desktop mock auth | Bypass OIDC, inject admin context | Small (2–3h) |
| US-12.8 — Worker middleware + routes | Session middleware, auth/users Hono routes | Medium (1 day) |
| US-12.9 — UI: login + protection + badge | Login page, route guard, user badge | Medium (1 day) |
| **Total** | | **~9–10 days** |

## Technical Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **AsyncLocalStorage in CF Workers** | CF Workers support `AsyncLocalStorage` natively since 2023. Confirm with `compatibility_date = "2023-01-01"` or later. |
| 2 | **Settings table PK recreation** | SQLite cannot `ALTER PRIMARY KEY`. Migration must: CREATE new table → copy data → DROP old → RENAME. Wrap in transaction. |
| 3 | **OIDC provider config stored in DB** | `client_secret` is sensitive — consider encrypting at rest or using Worker `secrets` instead of DB for production. |
| 4 | **id_token validation** | Full JWT signature verification requires the provider's JWKS. For simplicity, use `userinfo_url` call instead (additional round-trip but no JWKS fetch). Document this trade-off. |
| 5 | **Rolling session TTL in KV** | CF KV `put` with `expirationTtl` resets the clock — this is correct for rolling TTL. Desktop `MemoryCacheAdapter` must also reset TTL on `renewSession()`. |
| 6 | **First-admin bootstrap** | Race condition if two users register simultaneously. Use `INSERT INTO users ... WHERE (SELECT COUNT(*) FROM users) = 0` in a transaction. |
