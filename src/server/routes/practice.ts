import { json, error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { PracticeService } from "../../core/services/practice.service";
import { NotFoundError, ValidationError } from "../../core/errors";

function svc() { return new PracticeService(dbAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (method === "POST" && path === "/api/practice/attempts") {
    let body: { sentence_id?: string; version_id?: string; topic_id?: string };
    try { body = await req.json() as typeof body; }
    catch { return error("Invalid JSON body", 400); }

    try {
      const attempt = await svc().logAttempt({
        sentence_id: body.sentence_id ?? "",
        version_id:  body.version_id  ?? "",
        topic_id:    body.topic_id    ?? "",
      });
      return json(attempt, 201);
    } catch (e) {
      if (e instanceof NotFoundError)   return error(e.message, 404);
      if (e instanceof ValidationError) return error(e.message, 400);
      throw e;
    }
  }

  if (method === "GET" && path === "/api/practice/stats/daily")    return json(await svc().getDailyStats());
  if (method === "GET" && path === "/api/practice/stats/streak")   return json(await svc().getStreak());
  if (method === "GET" && path === "/api/practice/stats/recent")   return json(await svc().getRecent());
  if (method === "GET" && path === "/api/practice/stats/calendar") {
    const weeks = parseInt(url.searchParams.get("weeks") ?? "12", 10);
    return json(await svc().getCalendar(weeks));
  }

  return error("not found", 404);
}
