# Epic 11 — Cloudflare Deployment Target

**Phase:** CF-1 through CF-4 (parallel track to desktop, not a replacement)
**Goal:** Port the server layer to run on Cloudflare Workers + Pages while keeping the desktop (Bun) version fully functional in the same repo. The React client is shared and unchanged.
**Depends on:** Epic 1–9 complete (desktop version as reference implementation)

---

## Architecture Overview

```
lang-mirror/
├── src/
│   ├── client/          ← SHARED — no changes needed
│   ├── server/          ← Desktop target (Bun + bun:sqlite + fs)
│   └── worker/          ← NEW: Cloudflare target
│       ├── db/          ← D1 bindings (same schema, async API)
│       ├── lib/
│       ├── routes/      ← Same route logic, different storage layer
│       ├── services/
│       └── index.ts     ← CF Worker entry: export default { fetch }
├── functions/
│   └── api/
│       └── [[path]].ts  ← CF Pages Functions catch-all → worker router
├── wrangler.toml        ← CF Worker + D1 + R2 bindings config
└── package.json         ← Add wrangler devDependency + deploy scripts
```

### Infrastructure Mapping

| Desktop (Bun) | Cloudflare |
|---------------|-----------|
| `bun:sqlite` file at `~/.lang-mirror/db.sqlite` | **Cloudflare D1** (SQLite-compatible, HTTP-based) |
| `~/.lang-mirror/cache/tts/*.mp3` (filesystem) | **Cloudflare R2** bucket `lang-mirror-tts` |
| `~/.lang-mirror/recordings/**/*.webm` (filesystem) | **Cloudflare R2** bucket `lang-mirror-recordings` |
| `node-edge-tts` (Node.js library) | **Azure Cognitive Services TTS REST API** |
| `Bun.serve()` HTTP server | **Cloudflare Worker** `fetch` handler |
| `dist/` served by Bun | **Cloudflare Pages** (Vite SPA) |

### Key Code Pattern Differences

```typescript
// Desktop: synchronous, imported singleton
import { db } from "../db/client";
const rows = db.prepare("SELECT * FROM topics").all();

// Cloudflare: async, injected via env bindings
const rows = await env.DB.prepare("SELECT * FROM topics").all();
```

```typescript
// Desktop: Node.js fs
writeFileSync(path, buffer);
const data = readFileSync(path);

// Cloudflare R2
await env.R2.put(key, buffer);
const obj = await env.R2.get(key);
const data = await obj?.arrayBuffer();
```

---

## US-11.1 — Wrangler Scaffold & CF Project Setup

**Phase:** CF-1
**As a** developer,
**I want** a working Cloudflare Worker scaffold in the existing repo,
**So that** I can develop and deploy the CF target without disrupting the desktop version.

### Tasks
- Add `wrangler` to devDependencies: `bun add -d wrangler`
- Create `wrangler.toml`:
  ```toml
  name = "lang-mirror"
  main = "src/worker/index.ts"
  compatibility_date = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]

  [[d1_databases]]
  binding = "DB"
  database_name = "lang-mirror-db"
  database_id = "<placeholder — fill after cf d1 create>"

  [[r2_buckets]]
  binding = "TTS_CACHE"
  bucket_name = "lang-mirror-tts"

  [[r2_buckets]]
  binding = "RECORDINGS"
  bucket_name = "lang-mirror-recordings"

  [vars]
  AZURE_TTS_REGION = "eastus"
  # AZURE_TTS_KEY = set via wrangler secret put AZURE_TTS_KEY
  ```
- Create `src/worker/index.ts` — minimal stub:
  ```typescript
  import { workerRouter } from "./router";

  export interface Env {
    DB: D1Database;
    TTS_CACHE: R2Bucket;
    RECORDINGS: R2Bucket;
    AZURE_TTS_KEY: string;
    AZURE_TTS_REGION: string;
  }

  export default {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      return workerRouter(req, env, ctx);
    },
  };
  ```
- Create `src/worker/router.ts` — stub returning `{ status: "ok" }` for all `/api/*`
- Add package.json scripts:
  ```json
  {
    "cf:dev": "wrangler dev --local",
    "cf:deploy": "vite build && wrangler deploy",
    "cf:db:migrate": "wrangler d1 execute lang-mirror-db --file=./src/worker/db/schema.sql"
  }
  ```
- Create `functions/api/[[path]].ts` for CF Pages Functions integration:
  ```typescript
  export const onRequest: PagesFunction = async (ctx) => {
    // Delegate to worker router
    return workerRouter(ctx.request, ctx.env as Env, ctx);
  };
  ```
- Create CF resources via CLI:
  ```bash
  wrangler d1 create lang-mirror-db
  wrangler r2 bucket create lang-mirror-tts
  wrangler r2 bucket create lang-mirror-recordings
  ```
- Update `wrangler.toml` with real `database_id` after creation

### Acceptance Criteria
- [ ] `bun run cf:dev` starts a local CF Worker dev server
- [ ] `GET /api/health` returns `{ "status": "ok", "target": "cloudflare" }`
- [ ] `wrangler.toml` has valid D1 and R2 bindings (no placeholder IDs)
- [ ] Desktop `bun run dev` still works unchanged
- [ ] D1 database and both R2 buckets created in CF dashboard

---

## US-11.2 — D1 Database Layer

**Phase:** CF-1
**As a** developer,
**I want** the D1 database layer to use the same schema as the desktop SQLite version,
**So that** all existing SQL queries can be reused with minimal changes.

### Tasks
- Create `src/worker/db/schema.sql`:
  - Extract all `CREATE TABLE IF NOT EXISTS` statements from `src/server/db/migrations.ts`
  - Adapt any Bun-specific SQLite syntax for D1 compatibility (largely identical)
  - Tables: `topics`, `topic_language_versions`, `sentences`, `practice_attempts`, `settings`
  - All indexes
- Create `src/worker/db/migrations.ts`:
  ```typescript
  export async function runMigrations(db: D1Database): Promise<void> {
    const schema = await import("./schema.sql?raw");
    // D1 executes SQL statements
    await db.exec(schema.default);
    await seedDefaultSettings(db);
    console.log("✓ D1 migrations complete");
  }
  ```
- Create `src/worker/db/helpers.ts`:
  ```typescript
  // Thin wrappers matching the bun:sqlite API shape used in server routes
  // so route files need minimal edits

  export function prepareAll<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
    return db.prepare(sql).bind(...params).all<T>().then(r => r.results);
  }

  export function prepareFirst<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
    return db.prepare(sql).bind(...params).first<T>();
  }

  export function prepareRun(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
    return db.prepare(sql).bind(...params).run();
  }
  ```
- Run initial migration against local D1:
  ```bash
  bun run cf:db:migrate
  ```
- Seed default settings rows if not present (same defaults as desktop)

### Acceptance Criteria
- [ ] `bun run cf:db:migrate` applies schema with no errors
- [ ] All 5 tables exist in local D1 after migration
- [ ] Default settings rows inserted
- [ ] Running migration twice is idempotent (no errors, no duplicates)
- [ ] Helper types match D1 TypeScript bindings (`D1Database`, `D1Result`)

---

## US-11.3 — Port Topics, Versions & Sentences Routes

**Phase:** CF-2
**As a** user,
**I want** the core content CRUD API to work on Cloudflare,
**So that** topics, language versions, and sentences can be managed in the cloud version.

### Tasks
- Create `src/worker/routes/topics.ts`:
  - Copy logic from `src/server/routes/topics.ts`
  - Replace `db.prepare(...).all()` → `prepareAll(env.DB, ...)`
  - Replace `db.prepare(...).get()` → `prepareFirst(env.DB, ...)`
  - Replace `db.prepare(...).run()` → `prepareRun(env.DB, ...)`
  - All handlers become `async` (D1 is always async)
  - Handler signature: `handle(req: Request, url: URL, env: Env): Promise<Response>`
- Port `src/worker/routes/versions.ts` — same pattern
- Port `src/worker/routes/sentences.ts` — same pattern
- Port `src/worker/routes/practice.ts` — same pattern
- Port `src/worker/routes/settings.ts` — same pattern
- Port `src/worker/routes/export.ts` — pure DB reads, no file I/O
- Update `src/worker/router.ts` to wire these routes
- Create `src/worker/lib/response.ts` — copy from `src/server/lib/response.ts` (no changes needed)

### Acceptance Criteria
- [ ] `POST /api/topics { "title": "Shopping" }` → 201 with topic object
- [ ] `GET /api/topics` → returns array of topics
- [ ] `GET /api/topics/:id` → topic with nested versions and sentences
- [ ] `DELETE /api/topics/:id` cascades correctly via D1
- [ ] `GET /api/export/:topicId` → returns valid JSON download
- [ ] All routes return correct HTTP status codes and JSON bodies

---

## US-11.4 — Azure TTS Integration & R2 Cache

**Phase:** CF-2
**As a** user,
**I want** TTS audio to be generated and cached in R2,
**So that** I can hear sentences spoken aloud in the cloud version.

### Why Azure instead of node-edge-tts
`node-edge-tts` is a Node.js library using low-level `net` sockets and Node streams — not compatible with the CF Workers runtime. Azure Cognitive Services TTS exposes a standard **HTTPS REST API** that works perfectly from any `fetch`-capable runtime.

### Tasks
- Set up Azure TTS:
  - Create Azure Cognitive Services resource (free tier: 500k chars/month)
  - Store API key: `wrangler secret put AZURE_TTS_KEY`
  - Document region in `wrangler.toml` vars: `AZURE_TTS_REGION = "eastus"`
- Create `src/worker/services/tts.service.ts`:
  ```typescript
  export async function generateTTS(opts: TTSOptions, env: Env): Promise<TTSResult> {
    const key = getCacheKey(opts.text, opts.voice, opts.speed ?? 1.0, opts.pitch ?? 0);

    // 1. Check R2 cache
    const cached = await env.TTS_CACHE.get(key);
    if (cached) {
      return { audio: await cached.arrayBuffer(), cacheHit: true, cacheKey: key };
    }

    // 2. Generate via Azure TTS REST API
    const ssml = buildSSML(opts);
    const tokenRes = await fetch(
      `https://${env.AZURE_TTS_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_TTS_KEY } }
    );
    const token = await tokenRes.text();

    const ttsRes = await fetch(
      `https://${env.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "lang-mirror",
        },
        body: ssml,
      }
    );

    if (!ttsRes.ok) throw new Error(`Azure TTS error: ${ttsRes.status}`);
    const audio = await ttsRes.arrayBuffer();

    // 3. Store in R2 cache
    await env.TTS_CACHE.put(key, audio, {
      httpMetadata: { contentType: "audio/mpeg" },
    });

    return { audio, cacheHit: false, cacheKey: key };
  }
  ```
- `buildSSML(opts)`: generate SSML XML string with voice, rate, pitch
  - Map `speed` (float) → SSML `rate`: `1.2` → `"fast"` or `"+20%"`
  - Map `pitch` (semitones) → SSML `pitch`: `+2` → `"+2st"`
- Create `src/worker/routes/tts.ts`:
  - `GET /api/tts?text=...&voice=...&speed=...&pitch=...`
  - Same validation as desktop version
  - Return `audio/mpeg` response with `X-Cache: HIT|MISS` header
  - `DELETE /api/tts/cache` → list and delete all objects in `TTS_CACHE` R2 bucket
  - `GET /api/tts/cache/stats` → count and size of R2 objects
- Create `src/worker/services/voices.service.ts`:
  - Use same bundled fallback `voices-fallback.json` as desktop
  - No background refresh (CF Workers are stateless — serve from bundle only)
  - `GET /api/tts/voices` → return bundled list (optionally filtered by `?lang=`)

### Acceptance Criteria
- [ ] `GET /api/tts?text=hello&voice=en-US-JennyNeural` → returns `audio/mpeg`
- [ ] Second identical request → `X-Cache: HIT` (served from R2)
- [ ] R2 object stored with correct `contentType: "audio/mpeg"`
- [ ] `DELETE /api/tts/cache` clears R2 bucket and nulls DB cache keys
- [ ] `GET /api/tts/voices` returns voice list
- [ ] SSML correctly encodes voice, rate, pitch parameters

---

## US-11.5 — R2 Recording Storage

**Phase:** CF-2
**As a** user,
**I want** my practice recordings to be saved to and retrieved from R2,
**So that** I can record and play back my voice in the cloud version.

### Tasks
- Create `src/worker/routes/recordings.ts`:
  - `POST /api/recordings/:sentenceId`:
    - Validate sentence exists in D1
    - Detect content type from `Content-Type` header
    - Determine extension: `audio/webm` → `.webm`, `audio/ogg` → `.ogg`
    - R2 key: `recordings/{topicId}/{langCode}/sentence-{sentenceId}.{ext}`
    - Store: `await env.RECORDINGS.put(r2Key, req.body, { httpMetadata: { contentType } })`
    - Return `201 { path: r2Key }`
  - `GET /api/recordings/:sentenceId`:
    - Try `.webm` then `.ogg` key in R2
    - If found: stream R2 object body as response with correct `Content-Type`
    - If not found: `404 { "error": "No recording for this sentence" }`
  - `DELETE /api/recordings/:sentenceId`:
    - Delete both possible keys from R2
    - Return 204
  - `DELETE /api/recordings`:
    - List all objects with prefix `recordings/`
    - Delete all — return `{ deletedFiles, bytesFreed }`
- Note: R2 `get()` returns a `ReadableStream` body — stream directly to response:
  ```typescript
  const obj = await env.RECORDINGS.get(key);
  if (!obj) return error("No recording", 404);
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "audio/webm" }
  });
  ```

### Acceptance Criteria
- [ ] `POST /api/recordings/:id` with webm body → 201, object stored in R2
- [ ] `GET /api/recordings/:id` → streams correct audio back
- [ ] Second upload for same sentence overwrites the R2 object
- [ ] `DELETE /api/recordings/:id` removes the R2 object
- [ ] Recording plays back correctly in the browser `<audio>` element

---

## US-11.6 — Import Route (JSON/YAML → D1)

**Phase:** CF-3
**As a** user,
**I want** to import lesson JSON files into the cloud version,
**So that** I can populate the app with content without typing each sentence.

### Tasks
- Create `src/worker/services/import.service.ts`:
  - Copy logic from `src/server/services/import.service.ts`
  - Replace all `db.*` calls with `await prepareAll/First/Run(env.DB, ...)`
  - All operations in a D1 **batch transaction**:
    ```typescript
    const statements = [
      env.DB.prepare("INSERT INTO topics ...").bind(...),
      env.DB.prepare("INSERT INTO topic_language_versions ...").bind(...),
      // ... sentences
    ];
    await env.DB.batch(statements);
    ```
  - Remove YAML support (CF Workers have no `js-yaml` — add it or detect JSON only)
    - Option A: bundle `js-yaml` (check size — ~55KB minified, acceptable)
    - Option B: JSON-only for CF version, note in docs
- Create `src/worker/routes/import.ts`:
  - `POST /api/import` — multipart form with `file` field
  - `POST /api/import/preview` — no DB writes, parse only
  - Use CF `Request.formData()` API (standard, works in Workers)
- After import: trigger background TTS pre-cache using `ctx.waitUntil()`:
  ```typescript
  ctx.waitUntil(preloadVersionTTS(versionId, env));
  ```
  This lets the import response return immediately while TTS generates in background.

### Acceptance Criteria
- [ ] `POST /api/import` with a valid JSON file → 201 with import summary
- [ ] Topics, versions, sentences all inserted in D1
- [ ] `POST /api/import/preview` → returns preview without writing to D1
- [ ] D1 batch transaction rolls back all on any error
- [ ] TTS preload starts in background after import (non-blocking)

---

## US-11.7 — Cloudflare Pages Deployment Pipeline

**Phase:** CF-3
**As a** developer,
**I want** a one-command deploy that builds the SPA and deploys the Worker,
**So that** the CF version is always in sync with the codebase.

### Tasks
- Configure `wrangler.toml` for Pages + Worker:
  ```toml
  pages_build_output_dir = "dist"
  ```
  Or use separate CF Pages project pointing to same repo.
- Add `vite.config.ts` `build.outDir` = `dist` (already set)
- Create `.github/workflows/deploy-cf.yml`:
  ```yaml
  name: Deploy to Cloudflare

  on:
    push:
      branches: [main]
      paths:
        - 'src/**'
        - 'lessons/**'
        - 'wrangler.toml'

  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: oven-sh/setup-bun@v2
        - run: bun install
        - run: bun run build          # Vite build → dist/
        - run: bun run cf:db:migrate  # Apply D1 migrations
          env:
            CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
            CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        - uses: cloudflare/wrangler-action@v3
          with:
            apiToken: ${{ secrets.CF_API_TOKEN }}
            accountId: ${{ secrets.CF_ACCOUNT_ID }}
  ```
- Required GitHub secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`
- Add `bun run cf:deploy` script for manual deploys:
  ```json
  "cf:deploy": "vite build && wrangler pages deploy dist"
  ```
- Local dev workflow:
  ```bash
  bun run dev          # Desktop: Bun server + Vite
  bun run cf:dev       # Cloudflare: wrangler dev + Vite
  ```
- Document both workflows in README

### Acceptance Criteria
- [ ] `bun run cf:deploy` deploys SPA + Worker in one command
- [ ] GitHub Actions workflow triggers on push to `main`
- [ ] D1 migrations run automatically in CI before deploy
- [ ] CF Pages URL serves the SPA correctly
- [ ] `/api/health` returns `{ "status": "ok", "target": "cloudflare" }` on live URL
- [ ] Desktop `bun run dev` still works without any CF credentials

---

## US-11.8 — Auth & Multi-user Support (CF only)

**Phase:** CF-4
**As a** user,
**I want** to log in so my data is private and not shared with other users,
**So that** the cloud version is safe for public deployment.

### Context
The desktop version is single-user by design — no auth needed. The CF version is public-facing, so basic auth is required. The simplest approach is **Cloudflare Access** (zero-config SSO) or a lightweight **JWT-based auth** with D1-stored users.

### Recommended: Cloudflare Access (Option A — simplest)
- Protect the entire app behind Cloudflare Access
- Free for up to 50 users
- Supports GitHub OAuth, Google, email OTP
- No code changes needed — CF handles it at the edge
- Every request automatically has a `CF-Access-Authenticated-User-Email` header

### Alternative: JWT Auth (Option B — more control)
- `POST /api/auth/register` — create account, hash password, store in D1
- `POST /api/auth/login` — verify password, return signed JWT (using `jose` library)
- Middleware: verify JWT on all `/api/*` routes (except `/api/auth/*`)
- All DB queries scoped by `user_id`:
  - Add `user_id TEXT NOT NULL` column to `topics`, `practice_attempts`
  - All queries filter by `WHERE user_id = ?`

### Tasks (Option A — Cloudflare Access)
- Enable Cloudflare Access on the CF Pages domain via CF Zero Trust dashboard
- Add `user_email` extraction middleware in `src/worker/router.ts`:
  ```typescript
  const userEmail = req.headers.get("CF-Access-Authenticated-User-Email") ?? "anonymous";
  ```
- Pass `userEmail` as context to all route handlers
- Scope all topics/practice data by `user_email` in D1 queries:
  - Add `owner_email TEXT NOT NULL DEFAULT 'local'` to `topics`
  - Desktop version always uses `'local'` — no schema conflict

### Tasks (Option B — JWT Auth)
- Install `jose`: `bun add jose`
- Create `src/worker/services/auth.service.ts`
- Create `src/worker/routes/auth.ts` with register/login endpoints
- Add JWT verification middleware to router
- Add `user_id` column to relevant tables via D1 migration
- Update all route handlers to scope by `user_id`

### Acceptance Criteria (Option A)
- [ ] Unauthenticated requests to CF deployment redirect to CF Access login
- [ ] After login, user can access their own topics only
- [ ] Two different users' data is isolated in D1
- [ ] Desktop version unaffected (no auth)

### Acceptance Criteria (Option B)
- [ ] `POST /api/auth/register` creates a user and returns JWT
- [ ] `POST /api/auth/login` returns JWT for valid credentials
- [ ] All `/api/*` routes (except auth) require valid JWT
- [ ] Expired JWT returns 401

---

## Summary

| Story | Phase | Effort | Depends On |
|-------|-------|--------|-----------|
| US-11.1 — Wrangler Scaffold | CF-1 | Small (2–4h) | — |
| US-11.2 — D1 Database Layer | CF-1 | Medium (1 day) | 11.1 |
| US-11.3 — Topics/Versions/Sentences Routes | CF-2 | Medium (1 day) | 11.2 |
| US-11.4 — Azure TTS + R2 Cache | CF-2 | Medium (1 day) | 11.2 |
| US-11.5 — R2 Recording Storage | CF-2 | Small (half day) | 11.2 |
| US-11.6 — Import Route | CF-3 | Small (half day) | 11.3 |
| US-11.7 — Deployment Pipeline | CF-3 | Small (2–4h) | 11.1–11.6 |
| US-11.8 — Auth & Multi-user | CF-4 | Medium (1–2 days) | 11.3 |
| **Total** | | **~5–6 days** | |

## Technical Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **Azure TTS cost** (MEDIUM) | Free tier: 500k chars/month. Cache aggressively in R2 — most sentences are short (<100 chars). |
| 2 | **D1 latency** (LOW) | D1 adds ~1–5ms vs in-process SQLite. Acceptable for web; imperceptible to users. |
| 3 | **CF Worker CPU limit** (LOW) | 10ms CPU time on free tier. TTS generation is a single `fetch()` call — no CPU-heavy work. |
| 4 | **R2 egress cost** (LOW) | R2 has no egress fees (unlike S3). TTS audio and recordings are free to serve. |
| 5 | **YAML import on CF** (LOW) | Bundle `js-yaml` or restrict CF version to JSON-only. Document the difference. |
| 6 | **Wrangler D1 local emulation** (LOW) | `wrangler dev --local` uses a local SQLite file — good enough for development. |
