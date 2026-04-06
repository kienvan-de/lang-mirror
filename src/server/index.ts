import { ensureDataDirs } from "./lib/data-dir";
import { runMigrations } from "./db/migrations";
import { db } from "./db/client";
import { router } from "./router";
import { initVoices } from "./services/voices.service";
import { join } from "path";

// 1. Ensure data directories exist
ensureDataDirs();

// 2. Run DB migrations
runMigrations();

// 3. Load voices (bundled fallback + background network refresh)
initVoices();

// 3. Read port from settings (default 7842)
function getPort(): number {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'app.port'").get() as
      | { value: string }
      | undefined;
    return row ? parseInt(row.value, 10) : 7842;
  } catch {
    return 7842;
  }
}

function shouldOpenBrowser(): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'app.browserOpen'")
      .get() as { value: string } | undefined;
    return row?.value === "true";
  } catch {
    return true;
  }
}

const PORT = parseInt(process.env["PORT"] ?? String(getPort()), 10);
const DIST_DIR = join(import.meta.dir, "../../dist");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Try API router first
    const apiResponse = await router(req);
    if (apiResponse) return apiResponse;

    // Serve static files from dist/
    const filePath = join(DIST_DIR, url.pathname === "/" ? "index.html" : url.pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback — serve index.html for all non-file routes
    const indexFile = Bun.file(join(DIST_DIR, "index.html"));
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Dev mode: dist not built yet, show helpful message
    return new Response(
      "<html><body><h2>🪞 lang-mirror</h2><p>Run <code>bun run build</code> to build the frontend, or use <code>bun run dev</code> for development mode.</p></body></html>",
      { headers: { "Content-Type": "text/html" } }
    );
  },
});

console.log(`🪞 lang-mirror running at http://localhost:${PORT}`);

if (shouldOpenBrowser()) {
  const url = `http://localhost:${PORT}`;
  const openCmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", url]
        : ["xdg-open", url];
  Bun.spawn(openCmd, { stdout: "inherit", stderr: "inherit" });
}

export default server;
