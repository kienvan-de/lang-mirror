import { json, error } from "../lib/response";
import { generateTTS } from "../services/tts.service";
import { getVoices, refreshVoices } from "../services/voices.service";
import { db } from "../db/client";
import { TTS_CACHE_DIR } from "../lib/data-dir";
import { readdirSync, statSync, unlinkSync, existsSync } from "fs";

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // --- GET /api/tts?text=&voice=&speed=&pitch= ---
  if (method === "GET" && path === "/api/tts") {
    return handleTTSAudio(url);
  }

  // --- GET /api/tts/voices ---
  if (method === "GET" && path === "/api/tts/voices") {
    return handleVoicesList(url);
  }

  // --- POST /api/tts/voices/refresh ---
  if (method === "POST" && path === "/api/tts/voices/refresh") {
    const voices = await refreshVoices();
    return json(voices);
  }

  // --- GET /api/tts/preload-status/:versionId ---
  if (method === "GET" && path.startsWith("/api/tts/preload-status/")) {
    const versionId = path.split("/api/tts/preload-status/")[1];
    return handlePreloadStatus(versionId ?? "");
  }

  // --- GET /api/tts/cache/stats ---
  if (method === "GET" && path === "/api/tts/cache/stats") {
    return handleCacheStats();
  }

  // --- DELETE /api/tts/cache ---
  if (method === "DELETE" && path === "/api/tts/cache") {
    return handleCacheClear();
  }

  return error("not found", 404);
}

// ── US-3.3 — TTS Audio ─────────────────────────────────────────────────────

async function handleTTSAudio(url: URL): Promise<Response> {
  const text = url.searchParams.get("text") ?? "";
  const voice = url.searchParams.get("voice") ?? "";
  const speedRaw = url.searchParams.get("speed");
  const pitchRaw = url.searchParams.get("pitch");

  // Validation
  if (!text.trim()) return error("text is required", 400);
  if (text.length > 2000) return error("text must be 2000 characters or fewer", 400);
  if (!voice.trim()) return error("voice is required", 400);
  if (!/^[a-z]{2,3}-[A-Z]{2,4}-.+Neural$/.test(voice)) {
    return error("voice must be a valid Neural voice name (e.g. en-US-JennyNeural)", 400);
  }

  const speed = Math.min(2.0, Math.max(0.5, speedRaw ? parseFloat(speedRaw) : 1.0));
  const pitch = Math.min(10, Math.max(-10, pitchRaw ? parseInt(pitchRaw, 10) : 0));

  if (Number.isNaN(speed)) return error("speed must be a number between 0.5 and 2.0", 400);
  if (Number.isNaN(pitch)) return error("pitch must be an integer between -10 and 10", 400);

  try {
    const { audio, cacheHit } = await generateTTS({ text, voice, speed, pitch });

    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "public, max-age=86400",
        "X-Cache": cacheHit ? "HIT" : "MISS",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("TTS generation error:", err);
    return error("TTS generation failed", 500);
  }
}

// ── US-3.5 — Voice List ─────────────────────────────────────────────────────

function handleVoicesList(url: URL): Response {
  const lang = url.searchParams.get("lang");
  let voices = getVoices();
  if (lang) {
    voices = voices.filter((v) => v.langCode === lang || v.locale === lang);
  }
  return json(voices);
}

// ── US-3.4 — SSE Preload Status ─────────────────────────────────────────────

// In-memory preload progress map: versionId → { done, total }
export const preloadProgress = new Map<string, { done: number; total: number; finished: boolean }>();

function handlePreloadStatus(versionId: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(() => {
        const progress = preloadProgress.get(versionId);
        if (!progress) {
          send({ done: 0, total: 0, finished: false });
          return;
        }
        send(progress);
        if (progress.finished) {
          clearInterval(interval);
          controller.close();
        }
      }, 300);

      // Auto-close after 5 minutes if still open
      setTimeout(() => {
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      }, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── US-3.7 — Cache Management ────────────────────────────────────────────────

function handleCacheStats(): Response {
  if (!existsSync(TTS_CACHE_DIR)) {
    return json({ fileCount: 0, totalBytes: 0, totalMB: "0.00" });
  }
  const files = readdirSync(TTS_CACHE_DIR).filter((f) => f.endsWith(".mp3"));
  let totalBytes = 0;
  for (const f of files) {
    try {
      totalBytes += statSync(`${TTS_CACHE_DIR}/${f}`).size;
    } catch { /* skip */ }
  }
  return json({
    fileCount: files.length,
    totalBytes,
    totalMB: (totalBytes / 1_048_576).toFixed(2),
  });
}

function handleCacheClear(): Response {
  if (!existsSync(TTS_CACHE_DIR)) {
    return json({ deletedFiles: 0, bytesFreed: 0 });
  }

  const files = readdirSync(TTS_CACHE_DIR).filter((f) => f.endsWith(".mp3"));
  let deletedFiles = 0;
  let bytesFreed = 0;

  for (const f of files) {
    const filePath = `${TTS_CACHE_DIR}/${f}`;
    try {
      bytesFreed += statSync(filePath).size;
      unlinkSync(filePath);
      deletedFiles++;
    } catch { /* skip locked/missing */ }
  }

  // Reset all tts_cache_key in DB
  try {
    db.run("UPDATE sentences SET tts_cache_key = NULL");
  } catch (err) {
    console.error("Failed to reset tts_cache_key:", err);
  }

  return json({ deletedFiles, bytesFreed });
}
