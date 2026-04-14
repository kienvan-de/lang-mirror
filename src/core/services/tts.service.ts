import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage } from "../ports/storage.port";
import type { ITTSProvider } from "../ports/tts.port";
import type { IExecutionContext } from "../ports/execution.port";
import { getAuthContext, requireAuth } from "../auth/context";
import { SYSTEM_USER_ID } from "../db/schema";
import { NotFoundError } from "../errors";

const DEFAULT_VOICES: Record<string, string> = {
  en: "en-US-JennyNeural",
  ja: "ja-JP-NanamiNeural",
  de: "de-DE-KatjaNeural",
  vi: "vi-VN-HoaiMyNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ko: "ko-KR-SunHiNeural",
};

function defaultVoiceForLang(langCode: string): string {
  const base = langCode.split("-")[0]!.toLowerCase();
  return DEFAULT_VOICES[base] ?? "en-US-JennyNeural";
}

export interface TTSResult {
  /** Streaming MP3 audio — pipe directly into a Response body */
  stream: ReadableStream<Uint8Array>;
  cacheHit: boolean;
  cacheKey: string;
}

export interface CacheStats {
  fileCount: number;
  totalBytes: number;
  totalMB: string;
}

/** Compute a deterministic cache key for TTS params using Web Crypto SHA-256 */
async function computeCacheKey(
  text: string, voice: string, speed: number, pitch: number,
): Promise<string> {
  const input = `${text}|${voice}|${speed}|${pitch}`;
  const buf   = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `${hex}.mp3`;
}

// ── Resolved TTS params (from single DB query) ────────────────────────────────

interface ResolvedParams {
  text: string;
  voice: string;
  speed: number;
  pitch: number;
}

export class TTSService {
  constructor(
    private db:      IDatabase,
    private storage: IObjectStorage,
    private tts:     ITTSProvider,
    /** Optional — used by the CF Worker for background R2 writes on cache miss */
    private ctx?:    IExecutionContext,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Synthesise audio from raw params without DB lookup or cache.
   * Used by the /api/tts/preview endpoint for voice picker previews.
   */
  async synthesizeRaw(
    text: string,
    voice: string,
    speed: number,
    pitch: number,
  ): Promise<ReadableStream> {
    requireAuth();
    return this.tts.synthesize(text, voice, speed, pitch);
  }

  async getBySentenceId(sentenceId: string): Promise<TTSResult> {
    const params = await this.resolveParams(sentenceId);
    return this.synthesize(params);
  }

  // ── Parameter resolution — single D1 round-trip ───────────────────────────

  private async resolveParams(sentenceId: string): Promise<ResolvedParams> {
    const ctx     = getAuthContext();
    const ownerId = ctx.isAnonymous ? SYSTEM_USER_ID : ctx.id;

    // One query resolves sentence text + version overrides + user/system settings.
    // User voice preference is stored as a JSON map under key "tts.voices":
    //   {"ja":"ja-JP-NanamiNeural","de":"de-DE-KatjaNeural",...}
    // We read the whole map and extract the relevant language code in the app layer.
    const row = await this.db.queryFirst<{
      text:           string;
      language_code:  string;
      version_voice:  string | null;
      version_speed:  number | null;
      version_pitch:  number | null;
      user_voices:    string | null;   // JSON map: Record<langCode, voiceName>
      resolved_speed: string | null;
      resolved_pitch: string | null;
    }>(
      `SELECT
         s.text,
         v.language_code,
         v.voice_name                                                          AS version_voice,
         v.speed                                                               AS version_speed,
         v.pitch                                                               AS version_pitch,
         (SELECT value FROM settings
          WHERE key = 'tts.voices'
            AND owner_id = ?)                                                  AS user_voices,
         COALESCE(
           (SELECT value FROM settings
            WHERE key = 'tts.global.speed' AND owner_id = ?),
           (SELECT value FROM settings
            WHERE key = 'tts.global.speed' AND owner_id = ?)
         )                                                                     AS resolved_speed,
         COALESCE(
           (SELECT value FROM settings
            WHERE key = 'tts.global.pitch' AND owner_id = ?),
           (SELECT value FROM settings
            WHERE key = 'tts.global.pitch' AND owner_id = ?)
         )                                                                     AS resolved_pitch
       FROM sentences s
       JOIN topic_language_versions v ON v.id = s.version_id
       WHERE s.id = ?`,
      ownerId,                          // user_voices
      ownerId, SYSTEM_USER_ID,          // resolved_speed
      ownerId, SYSTEM_USER_ID,          // resolved_pitch
      sentenceId,
    );

    if (!row) throw new NotFoundError(`Sentence '${sentenceId}' not found`);

    // Extract the user's preferred voice for this language from the JSON map
    let userVoice: string | null = null;
    if (row.user_voices) {
      try {
        const map = JSON.parse(row.user_voices) as Record<string, string>;
        const base = row.language_code.split("-")[0]!.toLowerCase();
        userVoice = map[row.language_code] ?? map[base] ?? null;
      } catch { /* malformed JSON — ignore */ }
    }

    const voice = row.version_voice
      ?? userVoice
      ?? defaultVoiceForLang(row.language_code);

    const speed = row.version_speed ?? parseFloat(row.resolved_speed ?? "1.0");
    const pitch = row.version_pitch ?? parseInt(row.resolved_pitch  ?? "0",  10);

    return { text: row.text, voice, speed, pitch };
  }

  // ── Synthesis + streaming cache ───────────────────────────────────────────

  private async synthesize(params: ResolvedParams): Promise<TTSResult> {
    const { text, voice, speed, pitch } = params;
    const cacheKey = await computeCacheKey(text, voice, speed, pitch);

    // ── Cache HIT — wire R2 ReadableStream directly to response ──────────────
    // The CF runtime pipes this zero-copy; Worker CPU is released immediately.
    const cached = await this.storage.get(cacheKey);
    if (cached) {
      return { stream: cached.body, cacheHit: true, cacheKey };
    }

    // ── Cache MISS — synthesise then tee the stream ───────────────────────────
    const audioStream = await this.tts.synthesize(text, voice, speed, pitch);

    // tee() splits the stream into two independent readers:
    //   branch[0] → returned to caller → piped to HTTP response
    //   branch[1] → buffered to ArrayBuffer then written to R2 cache
    const [responseStream, cacheStream] = audioStream.tee();

    // Schedule the R2 write as a background task.
    // On CF Workers: ctx.waitUntil() keeps the Worker alive until the write finishes
    // even after the HTTP response has been flushed to the client.
    //
    // CF R2 put() requires a known-length body — a tee'd ReadableStream has no
    // Content-Length so R2 rejects it. Buffer the cache branch to an ArrayBuffer
    // first, which has a known byteLength that R2 can accept.
    const writePromise = new Response(cacheStream).arrayBuffer()
      .then(buf => this.storage.put(cacheKey, buf, { contentType: "audio/mpeg" }))
      .catch(err => console.warn(`[tts] Cache write failed for ${cacheKey}:`, err));
    if (this.ctx) {
      this.ctx.waitUntil(writePromise);
    } else {
      await writePromise;
    }

    return { stream: responseStream, cacheHit: false, cacheKey };
  }

  // ── Cache management ──────────────────────────────────────────────────────

  async getCacheStats(): Promise<CacheStats> {
    let cursor:     string | undefined;
    let fileCount   = 0;
    let totalBytes  = 0;

    do {
      const page = await this.storage.list("", { cursor, limit: 1000 });
      fileCount  += page.objects.length;
      totalBytes += page.objects.reduce((n, o) => n + o.size, 0);
      cursor      = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return {
      fileCount,
      totalBytes,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
    };
  }

  async clearCache(): Promise<{ deletedFiles: number; bytesFreed: number }> {
    let cursor:      string | undefined;
    let deletedFiles = 0;
    let bytesFreed   = 0;

    do {
      const page = await this.storage.list("", { cursor, limit: 1000 });
      if (page.objects.length > 0) {
        bytesFreed   += page.objects.reduce((n, o) => n + o.size, 0);
        await this.storage.deleteBatch(page.objects.map(o => o.key));
        deletedFiles += page.objects.length;
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return { deletedFiles, bytesFreed };
  }
}
