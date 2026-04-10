import type { IDatabase } from "../../core/ports/db.port";

/**
 * Desktop-only seed data.
 * Called after runMigrations() on desktop startup — never on CF Worker.
 *
 * Seeds:
 *   - A "desktop" OIDC provider (satisfies the FK in users.oidc_provider_id)
 *   - A "desktop-admin" user (matches MOCK_ADMIN in src/server/lib/auth-mock.ts)
 */
export async function seedDesktopData(db: IDatabase): Promise<void> {
  // 1. Mock OIDC provider — required as FK parent for the mock user
  await db.run(
    `INSERT OR IGNORE INTO oidc_providers
       (id, provider, display_name, client_id, redirect_uri, auth_url, token_url, userinfo_url, scope, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "desktop",
    "desktop",
    "Desktop",
    "desktop",
    "http://localhost:7842/api/auth/callback/desktop",
    "http://localhost:7842/api/auth/login/desktop",
    "http://localhost:7842/api/auth/token/desktop",
    "http://localhost:7842/api/auth/me",
    "openid email profile",
    0  // disabled = not shown on login page
  );

  // 2. Mock admin user — id must match MOCK_ADMIN.id in auth-mock.ts
  await db.run(
    `INSERT OR IGNORE INTO users
       (id, oidc_provider_id, user_id, email, email_verified, name, avatar_url, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "desktop-admin",
    "desktop",
    "desktop-admin",
    "admin@localhost",
    1,
    "Desktop Admin",
    null,
    "admin"
  );

  console.log("✓ Desktop seed data ready");
}
