import { json, error } from "../lib/response";
import { dbAdapter, storageAdapter } from "../lib/context";
import { RecordingsService } from "../../core/services/recordings.service";
import { NotFoundError, ValidationError } from "../../core/errors";

function svc() { return new RecordingsService(dbAdapter, storageAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // DELETE /api/recordings — delete all
  if (method === "DELETE" && path === "/api/recordings") {
    return json(await svc().deleteAll());
  }

  const match = path.match(/^\/api\/recordings\/([^/]+)$/);
  if (!match) return error("not found", 404);
  const sentenceId = match[1]!;

  if (method === "POST") {
    const contentType = req.headers.get("Content-Type") ?? "audio/webm";
    try {
      const result = await svc().upload(sentenceId, req.body!, contentType);
      return json(result, 201);
    } catch (e) {
      if (e instanceof NotFoundError)   return error(e.message, 404);
      if (e instanceof ValidationError) return error(e.message, 400);
      throw e;
    }
  }

  if (method === "GET") {
    try {
      const ref = await svc().get(sentenceId);
      return new Response(ref.object.body, {
        headers: {
          "Content-Type": ref.contentType,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      if (e instanceof NotFoundError) return error(e.message, 404);
      throw e;
    }
  }

  if (method === "DELETE") {
    try {
      await svc().delete(sentenceId);
      return new Response(null, { status: 204 });
    } catch (e) {
      if (e instanceof NotFoundError) return error(e.message, 404);
      throw e;
    }
  }

  return error("not found", 404);
}
