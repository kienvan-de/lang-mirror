import { error } from "./lib/response";
import * as topics from "./routes/topics";
import * as versions from "./routes/versions";
import * as sentences from "./routes/sentences";
import * as tts from "./routes/tts";
import * as recordings from "./routes/recordings";
import * as practice from "./routes/practice";
import * as settings from "./routes/settings";
import * as importRoute from "./routes/import";
import * as exportRoute from "./routes/export";

export async function router(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Handle CORS preflight
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

  // Health check — used by CI/CD to verify deployment
  if (path === "/api/health") {
    return new Response(
      JSON.stringify({ status: "ok", ts: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // /api/topics/:id/versions/* → versions handler (must come before /api/topics)
  if (path.match(/^\/api\/topics\/[^/]+\/versions/)) return versions.handle(req, url);
  if (path.startsWith("/api/topics")) return topics.handle(req, url);
  if (path.startsWith("/api/versions")) return versions.handle(req, url);
  if (path.startsWith("/api/sentences")) return sentences.handle(req, url);
  if (path.startsWith("/api/tts")) return tts.handle(req, url);
  if (path.startsWith("/api/recordings")) return recordings.handle(req, url);
  if (path.startsWith("/api/practice")) return practice.handle(req, url);
  if (path.startsWith("/api/settings")) return settings.handle(req, url);
  if (path === "/api/import" || path === "/api/import/preview") return importRoute.handle(req, url);
  if (path.startsWith("/api/export")) return exportRoute.handle(req, url);

  return error("not found", 404);
}
