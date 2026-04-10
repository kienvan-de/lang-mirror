-- Mock OIDC provider for local CF development (cf:dev only)
-- Applied via: bun run cf:migrate (which calls cf:seed:mock after schema)

INSERT OR REPLACE INTO oidc_providers
  (id, provider, display_name, client_id, client_secret, redirect_uri, auth_url, token_url, userinfo_url, scope, enabled)
VALUES
  ('mock-oidc', 'mock', 'Mock OIDC (dev)', 'lang-mirror-local', 'mock-secret',
   'http://localhost:7842/api/auth/callback/mock-oidc',
   'http://localhost:7843/authorize',
   'http://localhost:7843/token',
   'http://localhost:7843/userinfo',
   'openid email profile', 1);

INSERT OR REPLACE INTO settings (key, owner_id, value)
VALUES ('app.baseUrl', NULL, 'http://localhost:5173');
