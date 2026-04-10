/**
 * Seed the mock OIDC provider into the local Wrangler D1 database.
 *
 * Run once after `bun run clean:cf && bun run cf:migrate`:
 *   bun run cf:seed:mock
 *
 * This inserts one row into oidc_providers pointing to the mock OIDC
 * server running on localhost:7843.
 */

import { execSync } from "child_process";

const PROVIDER_ID   = "mock-oidc";
const REDIRECT_URI  = "http://localhost:7842/api/auth/callback/mock-oidc";
const MOCK_BASE     = "http://localhost:7843";

const sql = `
INSERT OR REPLACE INTO oidc_providers (
  id, provider, display_name,
  client_id, client_secret,
  redirect_uri,
  auth_url, token_url, userinfo_url,
  scope, enabled
) VALUES (
  '${PROVIDER_ID}',
  'mock',
  'Mock OIDC (dev)',
  'lang-mirror-local',
  'mock-secret',
  '${REDIRECT_URI}',
  '${MOCK_BASE}/authorize',
  '${MOCK_BASE}/token',
  '${MOCK_BASE}/userinfo',
  'openid email profile',
  1
);
`.trim();

const baseUrlSql = `
INSERT OR REPLACE INTO settings (key, owner_id, value)
VALUES ('app.baseUrl', NULL, 'http://localhost:5173');
`.trim();

function exec(command: string, sql: string) {
  execSync(
    `wrangler d1 execute lang-mirror-db --local --command "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
    { stdio: "inherit" }
  );
}

try {
  exec("mock-oidc", sql);
  console.log("✓ Mock OIDC provider seeded into local D1");

  exec("app.baseUrl", baseUrlSql);
  console.log("✓ app.baseUrl set to http://localhost:5173");

  console.log(`  Provider ID : ${PROVIDER_ID}`);
  console.log(`  Auth URL    : ${MOCK_BASE}/authorize`);
  console.log(`  Redirect URI: ${REDIRECT_URI}`);
  console.log(`  Post-login  : http://localhost:5173/?login=success`);
} catch (e) {
  console.error("Failed to seed mock OIDC:", e);
  process.exit(1);
}
