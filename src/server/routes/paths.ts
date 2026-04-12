import { json, error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { PathsService } from "../../core/services/paths.service";
import { NotFoundError, ForbiddenError, ValidationError } from "../../core/errors";

function svc() { return new PathsService(dbAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path   = url.pathname;
  const method = req.method;

  // GET /api/path — get or create user's path
  if (method === "GET" && path === "/api/path") return getOrCreate();

  // GET /api/path/search?q= — search other users' paths
  if (method === "GET" && path === "/api/path/search") return search(url);

  // PUT /api/path/:id — update path name/description
  const idMatch = path.match(/^\/api\/path\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1]!;
    if (method === "PUT") return update(req, id);
  }

  // POST /api/path/:id/topics — add topic to path
  const topicsMatch = path.match(/^\/api\/path\/([^/]+)\/topics$/);
  if (topicsMatch) {
    const id = topicsMatch[1]!;
    if (method === "POST") return addTopic(req, id);
  }

  // DELETE /api/path/:id/topics/:topicId — remove topic from path
  const removeTopicMatch = path.match(/^\/api\/path\/([^/]+)\/topics\/([^/]+)$/);
  if (removeTopicMatch) {
    const [, id, topicId] = removeTopicMatch;
    if (method === "DELETE") return removeTopic(id!, topicId!);
  }

  // POST /api/path/:id/topics/reorder — reorder topics
  const reorderMatch = path.match(/^\/api\/path\/([^/]+)\/topics\/reorder$/);
  if (reorderMatch) {
    const id = reorderMatch[1]!;
    if (method === "POST") return reorderTopics(req, id);
  }

  // POST /api/path/:id/copy — copy path into caller's path
  const copyMatch = path.match(/^\/api\/path\/([^/]+)\/copy$/);
  if (copyMatch) {
    const id = copyMatch[1]!;
    if (method === "POST") return copy(id);
  }

  return error("not found", 404);
}

async function getOrCreate(): Promise<Response> {
  return json(await svc().getOrCreate());
}

async function search(url: URL): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  return json(await svc().search(q));
}

async function update(req: Request, id: string): Promise<Response> {
  let body: { name?: string; description?: string };
  try { body = await req.json() as typeof body; }
  catch { return error("Invalid JSON body", 400); }

  try {
    return json(await svc().update(id, body));
  } catch (e) {
    if (e instanceof NotFoundError)   return error(e.message, 404);
    if (e instanceof ForbiddenError)  return error(e.message, 403);
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400);
    throw e;
  }
}

async function addTopic(req: Request, id: string): Promise<Response> {
  let body: { topicId: string };
  try { body = await req.json() as typeof body; }
  catch { return error("Invalid JSON body", 400); }

  try {
    return json(await svc().addTopic(id, body.topicId));
  } catch (e) {
    if (e instanceof NotFoundError)  return error(e.message, 404);
    if (e instanceof ForbiddenError) return error(e.message, 403);
    throw e;
  }
}

async function removeTopic(id: string, topicId: string): Promise<Response> {
  try {
    return json(await svc().removeTopic(id, topicId));
  } catch (e) {
    if (e instanceof NotFoundError)  return error(e.message, 404);
    if (e instanceof ForbiddenError) return error(e.message, 403);
    throw e;
  }
}

async function reorderTopics(req: Request, id: string): Promise<Response> {
  let body: { topicIds: string[] };
  try { body = await req.json() as typeof body; }
  catch { return error("Invalid JSON body", 400); }

  try {
    return json(await svc().reorderTopics(id, body.topicIds));
  } catch (e) {
    if (e instanceof NotFoundError)  return error(e.message, 404);
    if (e instanceof ForbiddenError) return error(e.message, 403);
    throw e;
  }
}

async function copy(id: string): Promise<Response> {
  try {
    return json(await svc().copy(id));
  } catch (e) {
    if (e instanceof NotFoundError)   return error(e.message, 404);
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400);
    throw e;
  }
}
