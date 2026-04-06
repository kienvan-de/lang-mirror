# Epic 1 — Project Setup & Infrastructure

**Phase:** 1 (first to implement)
**Goal:** A running Bun server + React SPA that can be developed and built, with SQLite initialized.

---

## US-1.1 — Initialize Bun + TypeScript Project

**As a** developer,
**I want** a fully configured project scaffold,
**So that** I can start building features without config friction.

### Tasks
- Run `bun init` with TypeScript template
- Create `package.json` with all required dependencies:
  ```json
  {
    "dependencies": {
      "react": "^18",
      "react-dom": "^18",
      "@tanstack/react-router": "^1",
      "@tanstack/react-query": "^5",
      "zustand": "^4",
      "node-edge-tts": "latest",
      "js-yaml": "^4"
    },
    "devDependencies": {
      "vite": "^5",
      "@vitejs/plugin-react": "^4",
      "tailwindcss": "^3",
      "autoprefixer": "^10",
      "postcss": "^8",
      "typescript": "^5",
      "@types/react": "^18",
      "@types/react-dom": "^18",
      "@types/js-yaml": "^4",
      "@types/bun": "latest"
    }
  }
  ```
- Create `tsconfig.json` for client (includes DOM lib)
- Create `tsconfig.server.json` for server (no DOM lib, targets Bun)
- Create `.gitignore`: `node_modules/`, `dist/`, `.env`
- Create `bunfig.toml` with basic Bun config

### Acceptance Criteria
- [ ] `bun install` completes with zero errors
- [ ] `tsc --noEmit` passes on both tsconfig files
- [ ] `.gitignore` covers all generated/secret files

---

## US-1.2 — Bun HTTP Server with Static File Serving

**As a** user,
**I want** the app to serve the React SPA from a Bun HTTP server,
**So that** I can open the app in my browser by running one command.

### Tasks
- Create `src/server/index.ts` using `Bun.serve()`
- Serve `dist/` directory for all non-API routes (SPA fallback to `dist/index.html`)
- Return `{ error: "Not found" }` JSON for unknown `/api/*` routes
- Read port from settings DB (default `7842`); fallback to env `PORT`
- Auto-open browser on start if `app.browserOpen` setting is true
- Log startup message: `🪞 lang-mirror running at http://localhost:7842`

### Acceptance Criteria
- [ ] `bun run server` starts without errors
- [ ] `curl http://localhost:7842` returns HTML
- [ ] `curl http://localhost:7842/api/unknown` returns `{ "error": "Not found" }` with 404
- [ ] Browser opens automatically on start

---

## US-1.3 — Vite + React + Tailwind Frontend Scaffold

**As a** developer,
**I want** a working React SPA with routing and styling configured,
**So that** I can build UI pages immediately.

### Tasks
- Create `index.html` (Vite entry point)
- Create `vite.config.ts`:
  - Plugin: `@vitejs/plugin-react`
  - Proxy: `/api/*` → `http://localhost:7842` (dev only)
  - Build output: `dist/`
- Create `tailwind.config.ts`: dark mode `class`, content paths for `src/client/**`
- Create `postcss.config.js`: autoprefixer + tailwindcss
- Create `src/client/main.tsx`:
  - Wrap app in `<QueryClientProvider>` + `<RouterProvider>`
  - TanStack Router with `createRouter` + `createRootRoute`
- Create `src/client/routes/__root.tsx`:
  - Root layout: nav bar (Dashboard, Topics, Import, Settings), main content `<Outlet/>`
  - Dark/light mode toggle
- Create stub pages: Dashboard (`/`), Topics (`/topics`), Import (`/import`), Settings (`/settings`)

### Acceptance Criteria
- [ ] `bun run dev` starts Vite dev server (port 5173)
- [ ] App opens in browser with nav bar visible
- [ ] Navigating between pages works without full page reload
- [ ] Tailwind classes render correctly

---

## US-1.4 — SQLite Database Initialization

**As a** developer,
**I want** the SQLite database to be created and migrated automatically on server startup,
**So that** I never need to manually run DB setup steps.

### Tasks
- Create `src/server/db/client.ts`:
  - Open `~/.lang-mirror/db.sqlite` using `bun:sqlite`
  - Enable WAL mode: `PRAGMA journal_mode = WAL`
  - Enable foreign keys: `PRAGMA foreign_keys = ON`
  - Export singleton `db` instance
- Create `src/server/db/schema.ts`:
  - All `CREATE TABLE IF NOT EXISTS` statements (see main plan for full schema)
  - Tables: `topics`, `topic_language_versions`, `sentences`, `practice_attempts`, `settings`
  - All indexes
- Create `src/server/db/migrations.ts`:
  - Call all schema creation statements on startup
  - Idempotent (uses `IF NOT EXISTS`)
  - Log: `✓ Database ready`
- Insert default settings rows if not present:
  - `practice.mode = "auto"`
  - `tts.global.speed = 1.0`
  - `tts.global.pitch = 0`
  - `app.port = 7842`
  - `app.browserOpen = true`

### Acceptance Criteria
- [ ] Fresh run creates `~/.lang-mirror/db.sqlite`
- [ ] All 5 tables exist after startup
- [ ] Running startup twice does not error or duplicate rows
- [ ] Default settings rows exist

---

## US-1.5 — Data Directory Setup

**As a** developer,
**I want** all required data directories to be created on first run,
**So that** file writes never fail due to missing directories.

### Tasks
- Create `src/server/lib/data-dir.ts`:
  - Export `DATA_DIR = path.join(os.homedir(), '.lang-mirror')`
  - Export `TTS_CACHE_DIR = path.join(DATA_DIR, 'cache', 'tts')`
  - Export `RECORDINGS_DIR = path.join(DATA_DIR, 'recordings')`
  - Function `ensureDataDirs()`: create all dirs with `mkdir -p` equivalent (`Bun.file` + `fs.mkdirSync`)
- Call `ensureDataDirs()` before server starts (before DB open)
- Log each created directory: `✓ Created ~/.lang-mirror/cache/tts`

### Acceptance Criteria
- [ ] All 3 directories exist after first run
- [ ] Existing directories are not touched or logged on subsequent runs
- [ ] Paths resolve correctly on macOS and Linux

---

## US-1.6 — API Router Scaffolding

**As a** developer,
**I want** a clean URL-based routing system for the Bun server,
**So that** each feature's API handler is isolated in its own module.

### Tasks
- Create `src/server/router.ts`:
  - Pattern-match on `new URL(req.url).pathname`
  - Route `/api/topics*` → `src/server/routes/topics.ts`
  - Route `/api/versions*` → `src/server/routes/versions.ts`
  - Route `/api/sentences*` → `src/server/routes/sentences.ts`
  - Route `/api/tts*` → `src/server/routes/tts.ts`
  - Route `/api/recordings*` → `src/server/routes/recordings.ts`
  - Route `/api/practice*` → `src/server/routes/practice.ts`
  - Route `/api/settings*` → `src/server/routes/settings.ts`
  - Route `/api/import` → `src/server/routes/import.ts`
  - Route `/api/export*` → `src/server/routes/export.ts`
  - Catch-all: 404 JSON
- Each route module exports: `handle(req: Request, url: URL): Promise<Response>`
- Create stub implementations for all routes (return `[]` or `{}`)
- Helper `json(data, status?)`: creates JSON response with correct headers
- Helper `error(message, status)`: creates error JSON response

### Acceptance Criteria
- [ ] `GET /api/topics` returns `[]` with 200
- [ ] `GET /api/unknown` returns `{ "error": "Not found" }` with 404
- [ ] All route files exist (even as stubs)
- [ ] CORS headers set for dev (`Access-Control-Allow-Origin: *`)

---

## US-1.7 — Dev Scripts + Build Scripts

**As a** developer,
**I want** simple commands to develop, build, and run the app,
**So that** the development workflow is smooth.

### Tasks
- Add to `package.json` scripts:
  ```json
  {
    "scripts": {
      "dev": "concurrently \"bun run dev:server\" \"bun run dev:client\"",
      "dev:server": "bun --watch src/server/index.ts",
      "dev:client": "vite",
      "build": "vite build",
      "start": "bun src/server/index.ts",
      "typecheck": "tsc --noEmit && tsc -p tsconfig.server.json --noEmit"
    }
  }
  ```
- Add `concurrently` to devDependencies (or use Bun's built-in parallel execution)
- Vite in dev mode proxies `/api` to `localhost:7842` — server must start first (add 500ms delay or wait-on)
- Production `bun run start`: serves built `dist/` directory

### Acceptance Criteria
- [ ] `bun run dev` starts both Vite (port 5173) and Bun server (port 7842)
- [ ] Changes to server code trigger hot-restart via `--watch`
- [ ] `bun run build` outputs to `dist/`
- [ ] `bun run start` serves the built SPA correctly
- [ ] `bun run typecheck` passes with no errors
