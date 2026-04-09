# Epic 10 — Shared Core Refactor + Hono for Worker

**Phase:** Refactor (runs parallel to, and prerequisite for, any further Epic 11 work)
**Goal:** Extract platform-agnostic business logic into `src/core/`, define adapter interfaces
(ports), implement platform-specific adapters for desktop (Bun) and Cloudflare Worker, and
replace the hand-rolled Worker router with Hono. After this epic both targets share the same
service layer — only the adapters differ.
**Depends on:** Epic 1–9 complete, Epic 11 initial scaffold done

---

## Motivation

Current state: `src/server/routes/` and `src/worker/routes/` are near-identical duplicates.
Every bug fix or feature must be applied twice. The only real differences are:

| Concern | Desktop | CF Worker |
|---------|---------|-----------|
| DB driver | `bun:sqlite` (sync) | D1 (async) |
| File storage | `fs` (local disk) | R2 (object store) |
| TTS | `node-edge-tts` | Edge TTS WebSocket via CF `fetch()` |
| HTTP framework | `Bun.serve()` manual router | Hand-rolled `if/match` router |

After this epic:
```
src/core/services/*.service.ts   ← single implementation, used by both
src/server/adapters/             ← wraps bun:sqlite / fs / node-edge-tts
src/worker/adapters/             ← wraps D1 / R2 / CF WebSocket
src/server/routes/               ← thin: build adapters → call service → return Response
src/worker/routes/               ← thin: Hono handlers → call service → c.json(...)
```

---

## Architecture

```
src/
├── client/                        ← unchanged
│
├── core/                          ← NEW — zero platform imports
│   ├── db/
│   │   ├── types.ts               ← all Row interfaces (TopicRow, SentenceRow, ...)
│   │   ├── schema.ts              ← DDL_STATEMENTS[] + DEFAULT_SETTINGS[]
│   │   └── migrations.ts          ← runMigrations(db: IDatabase)
│   ├── ports/
│   │   ├── db.port.ts             ← IDatabase interface
│   │   ├── storage.port.ts        ← IObjectStorage interface
│   │   └── tts.port.ts            ← ITTSProvider interface
│   └── services/
│       ├── topics.service.ts
│       ├── versions.service.ts
│       ├── sentences.service.ts
│       ├── tts.service.ts
│       ├── recordings.service.ts
│       ├── practice.service.ts
│       ├── settings.service.ts
│       ├── import.service.ts
│       └── export.service.ts
│
├── server/                        ← Desktop target (Bun)
│   ├── adapters/
│   │   ├── db.adapter.ts          ← BunSQLiteAdapter implements IDatabase
│   │   ├── storage.adapter.ts     ← FilesystemAdapter implements IObjectStorage
│   │   └── tts.adapter.ts         ← NodeEdgeTTSAdapter implements ITTSProvider
│   ├── routes/                    ← thin HTTP wrappers (unchanged surface)
│   └── index.ts
│
└── worker/                        ← CF Worker target
    ├── adapters/
    │   ├── db.adapter.ts          ← D1Adapter implements IDatabase
    │   ├── storage.adapter.ts     ← R2Adapter implements IObjectStorage
    │   └── tts.adapter.ts         ← EdgeTTSAdapter implements ITTSProvider
    ├── routes/                    ← Hono route handlers
    └── index.ts                   ← Hono app + ExportedHandler<Env>
```

---

## US-10.1 — Port Interfaces

**As a** developer,
**I want** three adapter interfaces that define the I/O contracts,
**So that** core services never import platform-specific code.

### `src/core/ports/db.port.ts`
```typescript
export interface IDatabase {
  /** SELECT → array */
  queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** SELECT LIMIT 1 → row or null */
  queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  /** INSERT / UPDATE / DELETE */
  run(sql: string, ...params: unknown[]): Promise<void>;
  /** Multiple statements in one atomic transaction */
  batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void>;
  /** DDL execution (CREATE TABLE, etc.) — used only by migrations */
  exec(sql: string): Promise<void>;
}
```

### `src/core/ports/storage.port.ts`
```typescript
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface IObjectStorage {
  /** Returns null if key not found */
  get(key: string): Promise<StoredObject | null>;
  put(key: string, data: ArrayBuffer | ReadableStream<Uint8Array>, opts?: { contentType?: string }): Promise<void>;
  delete(key: string): Promise<void>;
  /** List keys with optional prefix */
  list(prefix?: string): Promise<Array<{ key: string; size: number }>>;
}
```

### `src/core/ports/tts.port.ts`
```typescript
export interface ITTSProvider {
  /** Returns raw MP3 audio as ArrayBuffer */
  synthesize(text: string, voice: string, speed: number, pitch: number): Promise<ArrayBuffer>;
}
```

### Acceptance Criteria
- [ ] All three interfaces in `src/core/ports/`
- [ ] No platform imports (`bun:*`, `fs`, `D1Database`, etc.) anywhere in `src/core/`
- [ ] `tsc -p tsconfig.core.json --noEmit` passes (new tsconfig for core)

---

## US-10.2 — Shared DB Types & Schema

**As a** developer,
**I want** a single source of truth for DB row types and DDL,
**So that** desktop and worker never drift out of sync on schema.

### `src/core/db/types.ts`
All row interfaces currently duplicated across server and worker routes:
```typescript
export interface TopicRow { id: string; title: string; description: string | null; created_at: string; updated_at: string }
export interface VersionRow { id: string; topic_id: string; language_code: string; title: string | null; description: string | null; voice_name: string | null; speed: number | null; pitch: number | null; position: number; created_at: string; updated_at: string }
export interface SentenceRow { id: string; version_id: string; text: string; notes: string | null; position: number; tts_cache_key: string | null; created_at: string; updated_at: string }
export interface PracticeAttemptRow { id: string; sentence_id: string; version_id: string; topic_id: string; attempted_at: string }
export interface SettingRow { key: string; value: string; updated_at: string }
```

### `src/core/db/schema.ts`
Consolidates `src/server/db/migrations.ts` DDL array and `migrations/0001_initial_schema.sql`:
```typescript
export const DDL_STATEMENTS: string[] = [ /* CREATE TABLE IF NOT EXISTS ... */ ];
export const DEFAULT_SETTINGS: [string, string][] = [ /* ["practice.mode", "auto"], ... */ ];
```

### `src/core/db/migrations.ts`
```typescript
import type { IDatabase } from "../ports/db.port";
import { DDL_STATEMENTS, DEFAULT_SETTINGS } from "./schema";

export async function runMigrations(db: IDatabase): Promise<void> {
  for (const stmt of DDL_STATEMENTS) await db.exec(stmt);
  for (const [key, value] of DEFAULT_SETTINGS) {
    await db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", key, value);
  }
}
```

### Tasks
- Create `src/core/db/types.ts` — move all row interfaces here
- Create `src/core/db/schema.ts` — extract DDL from server migrations
- Create `src/core/db/migrations.ts` — adapter-agnostic runner
- Update `src/server/db/migrations.ts` to use `BunSQLiteAdapter` + `runMigrations` from core
- Update `src/worker/db/migrations.ts` to use `D1Adapter` + `runMigrations` from core
- Keep `migrations/0001_initial_schema.sql` in sync (used by `wrangler d1 migrations apply`)

### Acceptance Criteria
- [ ] All row types imported from `src/core/db/types.ts` in both server and worker
- [ ] `runMigrations` in core accepts `IDatabase` — no `bun:sqlite` or `D1Database` imports
- [ ] Both `bun run dev` and `bun run cf:migrate` still work correctly

---

## US-10.3 — Core Service Classes

**As a** developer,
**I want** all business logic in platform-agnostic service classes,
**So that** fixing a bug in `TopicsService` automatically fixes it for both desktop and CF.

### Design principles
- Each service receives adapters via constructor injection
- Services return plain objects/arrays (not `Response`) — HTTP layer handles that
- Services throw typed errors (`NotFoundError`, `ConflictError`) that HTTP adapters catch
- All methods are `async` (unified API regardless of sync bun:sqlite vs async D1)

### Error types (`src/core/errors.ts`)
```typescript
export class NotFoundError extends Error { constructor(msg: string) { super(msg); this.name = "NotFoundError"; } }
export class ConflictError extends Error { constructor(msg: string) { super(msg); this.name = "ConflictError"; } }
export class ValidationError extends Error { constructor(msg: string, public field?: string) { super(msg); this.name = "ValidationError"; } }
```

### Services to create

| File | Constructor args | Key methods |
|------|-----------------|-------------|
| `topics.service.ts` | `db: IDatabase` | `list()`, `create()`, `get()`, `update()`, `delete()` |
| `versions.service.ts` | `db: IDatabase, storage: IObjectStorage` | `list()`, `create()`, `get()`, `update()`, `delete()`, `reorder()` |
| `sentences.service.ts` | `db: IDatabase` | `list()`, `create()`, `update()`, `delete()`, `reorder()` |
| `tts.service.ts` | `db: IDatabase, storage: IObjectStorage, tts: ITTSProvider` | `getBySentenceId()`, `getByParams()`, `getCacheStats()`, `clearCache()` |
| `recordings.service.ts` | `db: IDatabase, storage: IObjectStorage` | `upload()`, `get()`, `delete()`, `deleteAll()` |
| `practice.service.ts` | `db: IDatabase` | `logAttempt()`, `getDailyStats()`, `getStreak()`, `getRecent()`, `getCalendar()` |
| `settings.service.ts` | `db: IDatabase` | `getAll()`, `get()`, `set()` |
| `import.service.ts` | `db: IDatabase` | `preview()`, `importFile()` — validation logic already in `src/core/services/import.validator.ts` |
| `export.service.ts` | `db: IDatabase` | `exportTopic()`, `exportAll()` |

### Acceptance Criteria
- [ ] All services in `src/core/services/`
- [ ] Zero imports of `bun:sqlite`, `D1Database`, `fs`, `path`, `node-edge-tts` in `src/core/`
- [ ] Each service method tested with mock `IDatabase` (basic unit test)
- [ ] `tsc -p tsconfig.core.json --noEmit` passes

---

## US-10.4 — Desktop Adapters

**As a** developer,
**I want** desktop-specific adapter classes that implement the port interfaces,
**So that** the desktop server wires existing bun:sqlite/fs/node-edge-tts to core services.

### `src/server/adapters/db.adapter.ts` — `BunSQLiteAdapter`
```typescript
import { Database } from "bun:sqlite";
import type { IDatabase } from "../../core/ports/db.port";

export class BunSQLiteAdapter implements IDatabase {
  constructor(private db: Database) {}

  async queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async run(sql: string, ...params: unknown[]): Promise<void> {
    this.db.prepare(sql).run(...params);
  }
  async batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
    const tx = this.db.transaction(() => {
      for (const { sql, params } of statements) {
        this.db.prepare(sql).run(...params);
      }
    });
    tx();
  }
  async exec(sql: string): Promise<void> {
    this.db.run(sql);
  }
}
```

### `src/server/adapters/storage.adapter.ts` — `FilesystemAdapter`
Wraps `fs.readFileSync/writeFileSync/unlinkSync` + directory scanning.

### `src/server/adapters/tts.adapter.ts` — `NodeEdgeTTSAdapter`
Wraps existing `src/server/services/tts.service.ts` `generateTTS()`.

### Tasks
- Create all three adapter classes
- Update `src/server/db/migrations.ts` to use `BunSQLiteAdapter` + shared `runMigrations`
- Update `src/server/index.ts` to instantiate adapters once at startup and share them

### Acceptance Criteria
- [ ] `BunSQLiteAdapter.queryAll()` passes same results as current `db.prepare().all()`
- [ ] `bun run dev` starts and all existing desktop functionality works unchanged
- [ ] `bun run typecheck` passes

---

## US-10.5 — CF Worker Adapters

**As a** developer,
**I want** CF Worker adapter classes that implement the port interfaces,
**So that** the worker wires D1/R2/EdgeTTS to the same core services as desktop.

### `src/worker/adapters/db.adapter.ts` — `D1Adapter`
```typescript
import type { IDatabase } from "../../core/ports/db.port";

export class D1Adapter implements IDatabase {
  constructor(private db: D1Database) {}

  async queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(...params).all<T>();
    return result.results;
  }
  async queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return this.db.prepare(sql).bind(...params).first<T>();
  }
  async run(sql: string, ...params: unknown[]): Promise<void> {
    await this.db.prepare(sql).bind(...params).run();
  }
  async batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
    await this.db.batch(
      statements.map(({ sql, params }) => this.db.prepare(sql).bind(...params))
    );
  }
  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }
}
```

### `src/worker/adapters/storage.adapter.ts` — `R2Adapter`
Wraps `R2Bucket.get/put/delete/list`.

### `src/worker/adapters/tts.adapter.ts` — `EdgeTTSAdapter`
Moves the CF WebSocket Edge TTS implementation from `src/worker/services/edge-tts.ts` here.

### Tasks
- Create all three adapter classes
- Remove now-redundant `src/worker/db/helpers.ts` (absorbed into `D1Adapter`)
- Remove `src/worker/services/edge-tts.ts` and `tts.service.ts` (absorbed into adapters + core)

### Acceptance Criteria
- [ ] `D1Adapter.queryAll()` returns same results as current `prepareAll()`
- [ ] `tsc -p tsconfig.worker.json --noEmit` passes
- [ ] `bun run cf:migrate` still works

---

## US-10.6 — Hono Router for Worker

**As a** developer,
**I want** the CF Worker to use Hono instead of the hand-rolled `if/match` router,
**So that** routes are typed, middleware is composable, and error handling is standardised.

### Install
```bash
bun add hono   # already installed: hono@4.12.12
```

### `src/worker/index.ts`
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { topicsRouter } from "./routes/topics";
import { versionsRouter } from "./routes/versions";
import { sentencesRouter } from "./routes/sentences";
import { ttsRouter } from "./routes/tts";
import { recordingsRouter } from "./routes/recordings";
import { practiceRouter } from "./routes/practice";
import { settingsRouter } from "./routes/settings";
import { importRouter } from "./routes/import";
import { exportRouter } from "./routes/export";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET","POST","PUT","DELETE","OPTIONS"] }));

app.get("/api/health", (c) =>
  c.json({ status: "ok", target: "cloudflare", ts: new Date().toISOString() })
);

app.route("/api/topics",     topicsRouter);
app.route("/api/versions",   versionsRouter);
app.route("/api/sentences",  sentencesRouter);
app.route("/api/tts",        ttsRouter);
app.route("/api/recordings", recordingsRouter);
app.route("/api/practice",   practiceRouter);
app.route("/api/settings",   settingsRouter);
app.route("/api/import",     importRouter);
app.route("/api/export",     exportRouter);

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  if (err.name === "NotFoundError")  return c.json({ error: err.message }, 404);
  if (err.name === "ConflictError")  return c.json({ error: err.message }, 409);
  if (err.name === "ValidationError") return c.json({ error: err.message }, 400);
  return c.json({ error: "internal server error" }, 500);
});

export default app;
```

### Hono route example
```typescript
// src/worker/routes/topics.ts
import { Hono } from "hono";
import { TopicsService } from "../../core/services/topics.service";
import { D1Adapter } from "../adapters/db.adapter";
import type { Env } from "../types";

export const topicsRouter = new Hono<{ Bindings: Env }>();

topicsRouter.get("/", async (c) => {
  const svc = new TopicsService(new D1Adapter(c.env.DB));
  return c.json(await svc.list());
});

topicsRouter.post("/", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string }>();
  const svc = new TopicsService(new D1Adapter(c.env.DB));
  return c.json(await svc.create(body.title ?? "", body.description), 201);
});

topicsRouter.get("/:id", async (c) => {
  const svc = new TopicsService(new D1Adapter(c.env.DB));
  return c.json(await svc.get(c.req.param("id")));
});

topicsRouter.put("/:id", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string }>();
  const svc = new TopicsService(new D1Adapter(c.env.DB));
  return c.json(await svc.update(c.req.param("id"), body));
});

topicsRouter.delete("/:id", async (c) => {
  const svc = new TopicsService(new D1Adapter(c.env.DB));
  await svc.delete(c.req.param("id"));
  return c.json({ deleted: true });
});
```

### Acceptance Criteria
- [ ] All existing `src/worker/routes/` migrated to Hono handlers
- [ ] `src/worker/router.ts` deleted
- [ ] All error types from `src/core/errors.ts` handled centrally in `app.onError()`
- [ ] `tsc -p tsconfig.worker.json --noEmit` passes
- [ ] `bun run cf:dev` starts and all worker routes respond correctly

---

## US-10.7 — Update Desktop Routes

**As a** developer,
**I want** `src/server/routes/` to call core services instead of calling `db` directly,
**So that** the desktop server uses the same logic as the worker.

### Pattern
```typescript
// src/server/routes/topics.ts — before
import { db } from "../db/client";
function listTopics(): Response {
  const rows = db.prepare("SELECT ...").all();
  return json(rows);
}

// src/server/routes/topics.ts — after
import { TopicsService } from "../../core/services/topics.service";
import { getDbAdapter } from "../adapters/db.adapter";
export async function handle(req: Request, url: URL): Promise<Response> {
  const svc = new TopicsService(getDbAdapter()); // singleton adapter
  // ...
}
```

### Tasks
- Update all 9 route files in `src/server/routes/` to use core services
- Create `src/server/lib/context.ts` — singleton adapter instances:
  ```typescript
  export const dbAdapter = new BunSQLiteAdapter(db);
  export const storageAdapter = new FilesystemAdapter(DATA_DIR);
  export const ttsAdapter = new NodeEdgeTTSAdapter();
  ```
- Delete `src/server/services/tts.service.ts` (absorbed into `NodeEdgeTTSAdapter` + `core/services/tts.service.ts`)
- Delete `src/server/services/import.service.ts` (moved to `core/services/import.service.ts`)

### Acceptance Criteria
- [ ] `bun run dev` works, all features functional
- [ ] `bun run typecheck` passes
- [ ] No direct `db.prepare()` calls in `src/server/routes/` — all via `IDatabase`

---

## Implementation Order

```
US-10.1  Port interfaces                    (small, unblocks everything)
  ↓
US-10.2  Shared DB types + schema + migrations
  ↓
US-10.3  Core service classes               (largest — do feature by feature)
  ↓        ↓
US-10.4  Desktop adapters               US-10.5  Worker adapters
  ↓                                         ↓
US-10.7  Update desktop routes          US-10.6  Hono worker routes
```

## Summary

| Story | Effort | Outcome |
|-------|--------|---------|
| US-10.1 — Port interfaces | Small (2–3h) | `IDatabase`, `IObjectStorage`, `ITTSProvider` |
| US-10.2 — Shared DB types & schema | Small (2–3h) | Single DDL, single row types |
| US-10.3 — Core service classes | Large (3–4 days) | 9 shared services |
| US-10.4 — Desktop adapters | Medium (1 day) | `BunSQLiteAdapter`, `FilesystemAdapter`, `NodeEdgeTTSAdapter` |
| US-10.5 — Worker adapters | Medium (1 day) | `D1Adapter`, `R2Adapter`, `EdgeTTSAdapter` |
| US-10.6 — Hono for worker | Medium (1 day) | Typed routes, central error handling |
| US-10.7 — Update desktop routes | Medium (1 day) | Desktop uses core services |
| **Total** | **~9–10 days** | Zero duplication, single bug fix covers both targets |

## Technical Risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **bun:sqlite is sync, D1 is async** | `IDatabase` interface is fully async — `BunSQLiteAdapter` wraps sync calls in `Promise.resolve()` |
| 2 | **bun:sqlite transactions** | `BunSQLiteAdapter.batch()` uses `db.transaction()` for true atomicity; `D1Adapter.batch()` uses `db.batch()` |
| 3 | **Large service classes** | Split by feature, implement one service at a time — start with `TopicsService` as the simplest |
| 4 | **Desktop regression** | Keep current routes working side-by-side until each route is migrated and tested |
| 5 | **Hono route parameter naming** | Hono uses `c.req.param("id")` — slightly different from manual regex; test all param patterns |
