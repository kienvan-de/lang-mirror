import { json, error } from "../lib/response";
import { dbAdapter, storageAdapter, ttsAdapter } from "../lib/context";
import { noopCtx } from "../lib/noop-execution-context";
import { TTSService } from "../../core/services/tts.service";
import { NotFoundError } from "../../core/errors";
import { getVoices, refreshVoices } from "../services/voices.service";
import { preloadProgress } from "../lib/preload-progress";

function svc() { return new TTSService(dbAdapter, storageAdapter, ttsAdapter, noopCtx); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path   = url.pathname;
  const method = req.method;

  // GET /api/tts/voices
  if (method === "GET" && path === "/api/tts/voices") {
    const lang = url.searchParams.get("lang") ?? undefined;
    return json(lang ? getVoices().filter(v => v.langCode === lang || v.locale === lang) : getVoices());
  }

  // POST /api/tts/voices/refresh
  if (method === "POST" && path === "/api/tts/voices/refresh") {
    return json(await refreshVoices());
  }

  // GET /api/tts/preload-status/:versionId  (SSE)
  if (method === "GET" && path.startsWith("/api/tts/preload-status/")) {
    const versionId = path.split("/api/tts/preload-status/")[1]!;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        const interval = setInterval(() => {
          const progress = preloadProgress.get(versionId);
          send(progress ?? { done: 0, total: 0, finished: false });
          if (progress?.finished) { clearInterval(interval); controller.close(); }
        }, 300);
        setTimeout(() => {
          clearInterval(interval);
          try { controller.close(); } catch { /* already closed */ }
        }, 5 * 60 * 1000);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // GET /api/tts/cache/stats
  if (method === "GET" && path === "/api/tts/cache/stats") {
    return json(await svc().getCacheStats());
  }

  // DELETE /api/tts/cache
  if (method === "DELETE" && path === "/api/tts/cache") {
    return json(await svc().clearCache());
  }

  // GET /api/tts/:sentenceId
  const sentenceMatch = path.match(/^\/api\/tts\/([^/]+)$/);
  if (method === "GET" && sentenceMatch) {
    try {
      const result = await svc().getBySentenceId(sentenceMatch[1]!);
      return new Response(result.stream, {
        headers: {
          "Content-Type":  "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
          "X-Cache":       result.cacheHit ? "HIT" : "MISS",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      if (e instanceof NotFoundError) return error(e.message, 404);
      throw e;
    }
  }

  return error("not found", 404);
}
