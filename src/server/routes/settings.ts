import { json, error } from "../lib/response";
import { db } from "../db/client";
import { DATA_DIR } from "../lib/data-dir";

interface SettingRow { key: string; value: string; updated_at: string }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // GET /api/settings — all settings as key→value map
  if (method === "GET" && path === "/api/settings") {
    const rows = db.prepare("SELECT key, value FROM settings").all() as SettingRow[];
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return json(map);
  }

  // GET /api/settings/data-path — return data directory path
  if (method === "GET" && path === "/api/settings/data-path") {
    return json({ path: DATA_DIR });
  }

  // GET /api/settings/:key
  const keyMatch = path.match(/^\/api\/settings\/(.+)$/);
  if (keyMatch) {
    const key = decodeURIComponent(keyMatch[1]!);
    if (method === "GET") {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      if (!row) return error(`Setting '${key}' not found`, 404);
      return json({ key, value: row.value });
    }
    if (method === "PUT") {
      let body: { value?: string };
      try { body = await req.json() as typeof body; }
      catch { return error("Invalid JSON body", 400); }
      if (body.value === undefined) return error("value is required", 400);
      db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `).run(key, String(body.value));
      return json({ key, value: String(body.value) });
    }
  }

  return error("not found", 404);
}
