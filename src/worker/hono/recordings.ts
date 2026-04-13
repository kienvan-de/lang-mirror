import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import type { Env } from "../types";

export const recordingsRouter = new Hono<{ Bindings: Env }>();

// ── Constants ─────────────────────────────────────────────────────────────────

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

/**
 * Read a ReadableStream into an ArrayBuffer, hard-capping at maxBytes.
 * Returns null if the stream exceeds the limit — the stream is cancelled.
 * This is the only reliable way to enforce a body size limit in CF Workers
 * since Content-Length can be absent or spoofed.
 */
async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<ArrayBuffer | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Combine chunks into a single ArrayBuffer
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

// Upload is the most expensive route (stream read + R2 write + DB update).
// Apply a tighter limit than import: 30 uploads per 60 s per user.
const recordingRateLimit = rateLimitMiddleware({
  limit:      30,
  windowSecs: 60,
  keyPrefix:  "recording",
});

recordingsRouter.use("*", recordingRateLimit);

// ── Routes ────────────────────────────────────────────────────────────────────

// DELETE /api/recordings — delete all (admin only)
recordingsRouter.delete("/", adminGuard, async (c) => {
  const { recordings } = await buildContext(c.env);
  return c.json(await recordings.deleteAll());
});

// GET /api/recordings/check/:versionId
recordingsRouter.get("/check/:versionId", validateUuidParam("versionId"), async (c) => {
  const { recordings } = await buildContext(c.env);
  const sentenceIds = await recordings.hasRecordingsForVersion(c.req.param("versionId")!);
  return c.json({ hasAny: sentenceIds.size > 0, sentenceIds: [...sentenceIds] });
});

// POST /api/recordings/:sentenceId
recordingsRouter.post("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  // Guard null body before attempting to stream — body is null for bodyless requests
  if (!c.req.raw.body) {
    return c.json({ error: "Request body is required" }, 400);
  }

  // Validate MIME type against allowlist
  const rawType  = (c.req.header("Content-Type") ?? "audio/webm").toLowerCase().trim();
  const baseType = rawType.split(";")[0]!.trim();
  if (!ALLOWED_AUDIO_TYPES.has(rawType) && !ALLOWED_AUDIO_TYPES.has(baseType)) {
    return c.json({ error: "Unsupported audio format" }, 415);
  }

  // Read body with hard byte cap — cannot trust Content-Length header
  const buf = await readBoundedStream(c.req.raw.body, MAX_RECORDING_BYTES);
  if (buf === null) return c.json({ error: "Recording exceeds 10 MB limit" }, 413);

  // Reject zero-byte uploads — they would write an empty file to R2
  if (buf.byteLength === 0) return c.json({ error: "Recording body is empty" }, 400);

  const { recordings } = await buildContext(c.env);
  const result = await recordings.upload(
    c.req.param("sentenceId")!,
    buf,      // ArrayBuffer — safe, bounded, non-empty
    baseType, // service will canonicalise before storing
  );
  return c.json(result, 201);
});

// GET /api/recordings/:sentenceId
recordingsRouter.get("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const { recordings } = await buildContext(c.env);
  const ref = await recordings.get(c.req.param("sentenceId")!);
  return new Response(ref.object.body, {
    headers: {
      "Content-Type":        ref.contentType,
      // inline: allow browser audio player to render it in-page;
      // filename is opaque (UUID-based) so no information is leaked.
      "Content-Disposition": `inline; filename="recording.${ref.contentType.split("/")[1]}"`,
      "Cache-Control":       "no-store",
    },
  });
});

// DELETE /api/recordings/:sentenceId
recordingsRouter.delete("/:sentenceId", validateUuidParam("sentenceId"), async (c) => {
  const { recordings } = await buildContext(c.env);
  await recordings.delete(c.req.param("sentenceId")!);
  return new Response(null, { status: 204 });
});
