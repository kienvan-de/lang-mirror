import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { getVoices } from "../services/voices.service";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import { ttsPreviewRateLimit } from "./middleware/rate-limit";
import type { Env } from "../types";

export const ttsRouter = new Hono<{ Bindings: Env }>();

// GET /api/tts/voices
ttsRouter.get("/voices", (c) => {
  const lang = c.req.query("lang") ?? undefined;
  return c.json(getVoices(lang));
});

// GET /api/tts/cache/stats  (admin only)
ttsRouter.get("/cache/stats", adminGuard, async (c) => {
  const { ttsService } = await buildContext(c.env);
  return c.json(await ttsService.getCacheStats());
});

// DELETE /api/tts/cache  (admin only)
ttsRouter.delete("/cache", adminGuard, async (c) => {
  const { ttsService } = await buildContext(c.env);
  return c.json(await ttsService.clearCache());
});

// GET /api/tts/preview?text=&voice=&speed=&pitch=
// Synthesises audio from raw params — no DB lookup, no cache write.
// Used by VoicePicker and VersionSettingsModal preview buttons.
// Must be registered before /:sentenceId to avoid UUID route conflict.
// Rate limited: 10 req / 60 s per user — prevents TTS cost abuse.
ttsRouter.get("/preview", ttsPreviewRateLimit, async (c) => {
  const text  = c.req.query("text")?.trim();
  const voice = c.req.query("voice")?.trim();
  const speed = parseFloat(c.req.query("speed") ?? "1");
  const pitch = parseInt(c.req.query("pitch")  ?? "0", 10);

  if (!text || !voice) {
    return c.json({ error: "text and voice are required" }, 400);
  }
  if (text.length > 150) {
    return c.json({ error: "text must be 150 characters or less" }, 400);
  }

  const { ttsService } = await buildContext(c.env);
  const stream = await ttsService.synthesizeRaw(text, voice, speed, pitch);

  return new Response(stream, {
    headers: {
      "Content-Type":  "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
});

// GET /api/tts/:sentenceId
// Pass c.executionCtx so TTSService can use waitUntil() to write to R2 in the
// background while the streamed response is already on its way to the client.
ttsRouter.get("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const { ttsService } = await buildContext(c.env, c.executionCtx);
  const result = await ttsService.getBySentenceId(c.req.param("sentenceId")!);

  return new Response(result.stream, {
    headers: {
      "Content-Type":  "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      "X-Cache":       result.cacheHit ? "HIT" : "MISS",
    },
  });
});
