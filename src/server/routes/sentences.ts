import { json, error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { SentencesService } from "../../core/services/sentences.service";
import { NotFoundError, ValidationError } from "../../core/errors";

function svc() { return new SentencesService(dbAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  const match = path.match(/^\/api\/sentences\/([^/]+)$/);
  if (!match) return error("not found", 404);
  const id = match[1]!;

  if (method === "PUT") {
    let body: { text?: string; notes?: Record<string, string> };
    try { body = await req.json() as typeof body; }
    catch { return error("Invalid JSON body", 400); }

    try {
      return json(await svc().update(id, body));
    } catch (e) {
      if (e instanceof NotFoundError)   return error(e.message, 404);
      if (e instanceof ValidationError) return error(e.message, 400);
      throw e;
    }
  }

  if (method === "DELETE") {
    try {
      await svc().delete(id);
      return json({ deleted: true });
    } catch (e) {
      if (e instanceof NotFoundError) return error(e.message, 404);
      throw e;
    }
  }

  return error("not found", 404);
}
