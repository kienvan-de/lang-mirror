import { json, error } from "../lib/response";
import { dbAdapter, storageAdapter } from "../lib/context";
import { VersionsService } from "../../core/services/versions.service";
import { NotFoundError, ConflictError, ValidationError } from "../../core/errors";

function svc() { return new VersionsService(dbAdapter, storageAdapter); }

function handleError(e: unknown): Response {
  if (e instanceof NotFoundError)   return error(e.message, 404);
  if (e instanceof ConflictError)   return error(e.message, 409);
  if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400);
  throw e;
}

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  const topicVersionsMatch = path.match(/^\/api\/topics\/([^/]+)\/versions$/);
  if (topicVersionsMatch) {
    const topicId = topicVersionsMatch[1]!;
    if (method === "GET")  try { return json(await svc().listByTopic(topicId)); } catch(e) { return handleError(e); }
    if (method === "POST") {
      let body: Record<string, unknown>;
      try { body = await req.json() as typeof body; } catch { return error("Invalid JSON body", 400); }
      try { return json(await svc().create(topicId, body as Parameters<VersionsService["create"]>[1]), 201); } catch(e) { return handleError(e); }
    }
  }

  const reorderVersionsMatch = path.match(/^\/api\/topics\/([^/]+)\/versions\/reorder$/);
  if (reorderVersionsMatch && method === "POST") {
    const { ids } = await req.json() as { ids: string[] };
    try { return json(await svc().reorder(reorderVersionsMatch[1]!, ids)); } catch(e) { return handleError(e); }
  }

  const versionMatch = path.match(/^\/api\/versions\/([^/]+)$/);
  if (versionMatch) {
    const id = versionMatch[1]!;
    if (method === "GET")    try { return json(await svc().get(id)); } catch(e) { return handleError(e); }
    if (method === "PUT") {
      const body = await req.json() as Parameters<VersionsService["update"]>[1];
      try { return json(await svc().update(id, body)); } catch(e) { return handleError(e); }
    }
    if (method === "DELETE") try { await svc().delete(id); return json({ deleted: true }); } catch(e) { return handleError(e); }
  }

  const reorderSentencesMatch = path.match(/^\/api\/versions\/([^/]+)\/sentences\/reorder$/);
  if (reorderSentencesMatch && method === "POST") {
    const { ids } = await req.json() as { ids: string[] };
    try { return json(await svc().reorderSentences(reorderSentencesMatch[1]!, ids)); } catch(e) { return handleError(e); }
  }

  const sentencesMatch = path.match(/^\/api\/versions\/([^/]+)\/sentences$/);
  if (sentencesMatch) {
    const versionId = sentencesMatch[1]!;
    if (method === "GET")  try { return json(await svc().listSentences(versionId)); } catch(e) { return handleError(e); }
    if (method === "POST") {
      const body = await req.json() as Parameters<VersionsService["createSentence"]>[1];
      try { return json(await svc().createSentence(versionId, body), 201); } catch(e) { return handleError(e); }
    }
  }

  return error("not found", 404);
}
