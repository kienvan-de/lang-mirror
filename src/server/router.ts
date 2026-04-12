import { error } from "./lib/response";
import { withMockAuth } from "./lib/auth-mock";
import * as authRoute   from "./routes/auth";
import * as topics      from "./routes/topics";
import * as versions    from "./routes/versions";
import * as sentences   from "./routes/sentences";
import * as tts         from "./routes/tts";
import * as recordings  from "./routes/recordings";
import * as practice    from "./routes/practice";
import * as settings    from "./routes/settings";
import * as importRoute from "./routes/import";
import * as exportRoute from "./routes/export";
import * as paths       from "./routes/paths";

export async function router(req: Request): Promise<Response | null> {
  const url  = new URL(req.url);
  const path = url.pathname;

  // CORS preflight — no auth needed
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (!path.startsWith("/api/")) return null;

  // Health check — no auth needed
  if (path === "/api/health") {
    return new Response(
      JSON.stringify({ status: "ok", target: "desktop", ts: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Auth routes — mock implementation, no auth context needed
  if (path.startsWith("/api/auth")) return authRoute.handle(req, url);

  // All other routes run inside the mock admin context
  return withMockAuth(async () => {
    if (path.startsWith("/api/path"))              return paths.handle(req, url);
    if (path.match(/^\/api\/topics\/[^/]+\/versions/)) return versions.handle(req, url);
    if (path.startsWith("/api/topics"))     return topics.handle(req, url);
    if (path.startsWith("/api/versions"))   return versions.handle(req, url);
    if (path.startsWith("/api/sentences"))  return sentences.handle(req, url);
    if (path.startsWith("/api/tts"))        return tts.handle(req, url);
    if (path.startsWith("/api/recordings")) return recordings.handle(req, url);
    if (path.startsWith("/api/practice"))   return practice.handle(req, url);
    if (path.startsWith("/api/settings"))   return settings.handle(req, url);
    if (path === "/api/import" || path === "/api/import/preview") return importRoute.handle(req, url);
    if (path.startsWith("/api/export"))     return exportRoute.handle(req, url);
    return error("not found", 404);
  });
}
