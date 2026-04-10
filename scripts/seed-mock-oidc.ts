/**
 * Seed the mock OIDC provider and app.baseUrl into the local Wrangler D1 database.
 *
 * Run once after `bun run clean:cf && bun run cf:migrate`:
 *   bun run cf:seed:mock
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";

const PROVIDER_ID  = "mock-oidc";
const REDIRECT_URI = "http://localhost:7842/api/auth/callback/mock-oidc";
const MOCK_BASE    = "http://localhost:7843";
const APP_BASE_URL = "http://localhost:5173";
const TMP_SQL      = "/tmp/seed-mock-oidc.sql";

const sql = `
INSERT OR REPLACE INTO oidc_providers
  (id, provider, display_name, client_id, client_secret, redirect_uri, auth_url, token_url, userinfo_url, scope, enabled)
VALUES
  ('${PROVIDER_ID}', 'mock', 'Mock OIDC (dev)', 'lang-mirror-local', 'mock-secret',
   '${REDIRECT_URI}', '${MOCK_BASE}/authorize', '${MOCK_BASE}/token', '${MOCK_BASE}/userinfo',
   'openid email profile', 1);

INSERT OR REPLACE INTO settings (key, owner_id, value)
VALUES ('app.baseUrl', NULL, '${APP_BASE_URL}');
`;

writeFileSync(TMP_SQL, sql.trim(), "utf-8");

try {
  execSync(`wrangler d1 execute lang-mirror-db --local --file=${TMP_SQL}`, { stdio: "inherit" });
  console.log("✓ Mock OIDC provider seeded");
  console.log(`  Provider ID : ${PROVIDER_ID}`);
  console.log(`  Auth URL    : ${MOCK_BASE}/authorize`);
  console.log(`  Redirect URI: ${REDIRECT_URI}`);
  console.log(`  app.baseUrl : ${APP_BASE_URL}`);
} finally {
  unlinkSync(TMP_SQL);
}
