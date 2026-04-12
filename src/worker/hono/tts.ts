import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { getVoices } from "../services/voices.service";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

export const ttsRouter = new Hono<{ Bindings: Env }>();

// GET /api/tts/voices
ttsRouter.get("/voices", (c) => {
  const lang = c.req.query("lang") ?? undefined;
  return c.json(getVoices(lang));
});

// GET /api/tts/cache/stats  (admin only)
ttsRouter.get("/cache/stats", adminGuard, async (c) => {
  const { ttsService } = buildContext(c.env);
  return c.json(await ttsService.getCacheStats());
});

// DELETE /api/tts/cache  (admin only)
ttsRouter.delete("/cache", adminGuard, async (c) => {
  const { ttsService } = buildContext(c.env);
  return c.json(await ttsService.clearCache());
});

// GET /api/tts/:sentenceId
// Pass c.executionCtx so TTSService can use waitUntil() to write to R2 in the
// background while the streamed response is already on its way to the client.
ttsRouter.get("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const { ttsService } = buildContext(c.env, c.executionCtx);
  const result = await ttsService.getBySentenceId(c.req.param("sentenceId"));

  return new Response(result.stream, {
    headers: {
      "Content-Type":  "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      "X-Cache":       result.cacheHit ? "HIT" : "MISS",
    },
  });
});
