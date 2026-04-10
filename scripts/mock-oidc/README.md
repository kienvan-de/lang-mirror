# Mock OIDC Server

A minimal standalone OIDC Authorization Code + PKCE server for local CF development.
Runs on **port 7843** alongside Wrangler (7842) and Vite (5173).

## Usage

```bash
# First-time setup (after clean:cf + cf:migrate):
bun run cf:seed:mock

# Start everything including mock OIDC:
bun run cf:dev
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET  /.well-known/openid-configuration` | OIDC discovery document |
| `GET  /authorize` | Login form — select a mock user |
| `POST /authorize/submit` | Form submit → redirect with code |
| `POST /token` | Code → access_token exchange |
| `GET  /userinfo` | Returns user claims for access_token |

## Mock users

Defined in `server.ts` — edit `MOCK_USERS` to add more:

| Username | Email | Role hint |
|----------|-------|-----------|
| `admin` | admin@mock.local | admin |
| `user` | user@mock.local | user |

> **Note**: The `role_hint` is informational only. The actual role is set
> in the app's `users` table. After first login you'll need to manually
> set `role = 'admin'` for the admin user via:
> ```bash
> wrangler d1 execute lang-mirror-db --local \
>   --command "UPDATE users SET role = 'admin' WHERE email = 'admin@mock.local'"
> ```

## Flow

```
User clicks "Mock OIDC (dev)" on /login
  → POST /api/auth/login/mock-oidc  (Wrangler :7842)
  → { redirectUrl: "http://localhost:7843/authorize?..." }
  → Browser redirects to mock OIDC login form (:7843)
  → User selects mock user → submits
  → Mock OIDC redirects to: http://localhost:7842/api/auth/callback/mock-oidc?code=...
  → Wrangler exchanges code at http://localhost:7843/token
  → Wrangler fetches userinfo at http://localhost:7843/userinfo
  → Session cookie set → redirect to /
```
