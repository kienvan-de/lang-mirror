import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { getVoices } from "../services/voices.service";
import { adminGuard } from "./middleware/admin";
import type { Env } from "../types";

export const ttsRouter = new Hono<{ Bindings: Env }>();

// GET /api/tts/voices
ttsRouter.get("/voices", (c) => {
  const lang = c.req.query("lang") ?? undefined;
  return c.json(getVoices(lang));
});

// GET /api/tts/cache/stats
ttsRouter.get("/cache/stats", adminGuard, async (c) => {
  const { ttsService } = buildContext(c.env);
  return c.json(await ttsService.getCacheStats());
});

// DELETE /api/tts/cache
ttsRouter.delete("/cache", adminGuard, async (c) => {
  const { ttsService } = buildContext(c.env);
  return c.json(await ttsService.clearCache());
});

// GET /api/tts/:sentenceId — preferred: resolves text/voice/speed from DB
ttsRouter.get("/:sentenceId", async (c) => {
  const { ttsService } = buildContext(c.env);
  const result = await ttsService.getBySentenceId(c.req.param("sentenceId"));
  return new Response(result.audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      "X-Cache": result.cacheHit ? "HIT" : "MISS",
    },
  });
});

// GET /api/tts?text=...&voice=...&speed=...&pitch=... — legacy
ttsRouter.get("/", async (c) => {
  const text  = c.req.query("text")?.trim();
  const voice = c.req.query("voice")?.trim();
  const speed = parseFloat(c.req.query("speed") ?? "1.0");
  const pitch = parseInt(c.req.query("pitch") ?? "0", 10);

  if (!text)  return c.json({ error: "text is required" }, 400);
  if (!voice) return c.json({ error: "voice is required" }, 400);
  if (text.length > 2000) return c.json({ error: "text must be 2000 characters or fewer" }, 400);

  const { ttsService } = buildContext(c.env);
  const result = await ttsService.getByParams(
    text, voice,
    Math.min(2.0, Math.max(0.5, speed)),
    Math.min(10, Math.max(-10, pitch))
  );
  return new Response(result.audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      "X-Cache": result.cacheHit ? "HIT" : "MISS",
    },
  });
});
