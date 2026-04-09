import { json, error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { DATA_DIR } from "../lib/data-dir";
import { SettingsService } from "../../core/services/settings.service";
import { NotFoundError, ValidationError } from "../../core/errors";

function svc() { return new SettingsService(dbAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/api/settings") return json(await svc().getAll());

  if (method === "GET" && path === "/api/settings/data-path") {
    return json({ path: DATA_DIR });
  }

  const keyMatch = path.match(/^\/api\/settings\/(.+)$/);
  if (keyMatch) {
    const key = decodeURIComponent(keyMatch[1]!);

    if (method === "GET") {
      try { return json(await svc().get(key)); }
      catch (e) { if (e instanceof NotFoundError) return error(e.message, 404); throw e; }
    }

    if (method === "PUT") {
      let body: { value?: string };
      try { body = await req.json() as typeof body; }
      catch { return error("Invalid JSON body", 400); }
      if (body.value === undefined) return error("value is required", 400);
      try { return json(await svc().set(key, String(body.value))); }
      catch (e) { if (e instanceof ValidationError) return error(e.message, 400); throw e; }
    }
  }

  return error("not found", 404);
}
