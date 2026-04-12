import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

export const recordingsRouter = new Hono<{ Bindings: Env }>();

// DELETE /api/recordings — delete all (admin only)
recordingsRouter.delete("/", adminGuard, async (c) => {
  const { recordings } = buildContext(c.env);
  return c.json(await recordings.deleteAll());
});

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/webm; codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/ogg; codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

const MAX_RECORDING_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /api/recordings/:sentenceId
recordingsRouter.post("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const rawType = (c.req.header("Content-Type") ?? "audio/webm").toLowerCase().trim();
  // Normalise: strip parameters for allowlist check but keep original for storage
  const baseType = rawType.split(";")[0]!.trim();
  if (!ALLOWED_AUDIO_TYPES.has(rawType) && !ALLOWED_AUDIO_TYPES.has(baseType)) {
    return c.json({ error: "Unsupported audio format" }, 415);
  }

  // Enforce upload size limit
  const contentLength = parseInt(c.req.header("Content-Length") ?? "0", 10);
  if (contentLength > MAX_RECORDING_BYTES) {
    return c.json({ error: "Recording exceeds 10 MB limit" }, 413);
  }

  const { recordings } = buildContext(c.env);
  const result = await recordings.upload(
    c.req.param("sentenceId"),
    c.req.raw.body!,
    baseType,  // store normalised base MIME type only
  );
  return c.json(result, 201);
});

// GET /api/recordings/:sentenceId
recordingsRouter.get("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const { recordings } = buildContext(c.env);
  const ref = await recordings.get(c.req.param("sentenceId"));
  return new Response(ref.object.body, {
    headers: {
      "Content-Type": ref.contentType,
      "Cache-Control": "no-store",
    },
  });
});

// DELETE /api/recordings/:sentenceId
recordingsRouter.delete("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const { recordings } = buildContext(c.env);
  await recordings.delete(c.req.param("sentenceId"));
  return new Response(null, { status: 204 });
});
