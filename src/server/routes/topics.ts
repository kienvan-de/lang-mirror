import { json, error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { TopicsService } from "../../core/services/topics.service";
import { NotFoundError, ValidationError } from "../../core/errors";

function svc() { return new TopicsService(dbAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (method === "GET"  && path === "/api/topics") return listTopics();
  if (method === "POST" && path === "/api/topics") return createTopic(req);

  const idMatch = path.match(/^\/api\/topics\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1]!;
    if (method === "GET")    return getTopic(id);
    if (method === "PUT")    return updateTopic(req, id);
    if (method === "DELETE") return deleteTopic(id);
  }

  return error("not found", 404);
}

async function listTopics(): Promise<Response> {
  return json(await svc().list());
}

async function createTopic(req: Request): Promise<Response> {
  let body: { title?: string; description?: string };
  try { body = await req.json() as typeof body; }
  catch { return error("Invalid JSON body", 400); }

  try {
    const topic = await svc().create(body.title ?? "", body.description);
    return json(topic, 201);
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400);
    throw e;
  }
}

async function getTopic(id: string): Promise<Response> {
  try {
    return json(await svc().get(id));
  } catch (e) {
    if (e instanceof NotFoundError) return error(e.message, 404);
    throw e;
  }
}

async function updateTopic(req: Request, id: string): Promise<Response> {
  let body: { title?: string; description?: string };
  try { body = await req.json() as typeof body; }
  catch { return error("Invalid JSON body", 400); }

  try {
    return json(await svc().update(id, body));
  } catch (e) {
    if (e instanceof NotFoundError)  return error(e.message, 404);
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400);
    throw e;
  }
}

async function deleteTopic(id: string): Promise<Response> {
  try {
    await svc().delete(id);
    return json({ deleted: true });
  } catch (e) {
    if (e instanceof NotFoundError) return error(e.message, 404);
    throw e;
  }
}
