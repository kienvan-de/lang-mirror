import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage } from "../ports/storage.port";
import type { ITTSProvider } from "../ports/tts.port";
import type { SentenceRow, VersionRow } from "../db/types";
import { getAuthContext } from "../auth/context";
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
  audio: ArrayBuffer;
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
  text: string, voice: string, speed: number, pitch: number
): Promise<string> {
  const input = `${text}|${voice}|${speed}|${pitch}`;
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  const hex = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `${hex}.mp3`;
}

export class TTSService {
  constructor(
    private db: IDatabase,
    private storage: IObjectStorage,
    private tts: ITTSProvider,
  ) {}

  async getBySentenceId(sentenceId: string): Promise<TTSResult> {
    const sentence = await this.db.queryFirst<SentenceRow & { language_code: string }>(
      `SELECT s.*, v.language_code, v.voice_name, v.speed, v.pitch
       FROM sentences s
       JOIN topic_language_versions v ON v.id = s.version_id
       WHERE s.id = ?`,
      sentenceId
    );
    if (!sentence) throw new NotFoundError(`Sentence '${sentenceId}' not found`);

    const version = await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", sentence.version_id
    );
    if (!version) throw new NotFoundError("Version not found");

    // Resolve owner: use authenticated user's settings if available, fall back to system defaults
    const ctx = getAuthContext();
    const ownerId = ctx.isAnonymous ? SYSTEM_USER_ID : ctx.id;

    // Resolve voice: version override → user setting → system default → language default
    const userVoice = ctx.isAnonymous ? null : await this.db.queryFirst<{ value: string }>(
      "SELECT value FROM settings WHERE key = ? AND owner_id = ?",
      `tts.voices.${version.language_code}`, ownerId
    );
    const systemVoice = userVoice ? null : await this.db.queryFirst<{ value: string }>(
      "SELECT value FROM settings WHERE key = ? AND owner_id = ?",
      `tts.voices.${version.language_code}`, SYSTEM_USER_ID
    );
    const voice = version.voice_name ?? userVoice?.value ?? systemVoice?.value ?? defaultVoiceForLang(version.language_code);

    const speedRow = await this.db.queryFirst<{ value: string }>(
      `SELECT COALESCE(u.value, s.value) as value
       FROM settings s
       LEFT JOIN settings u ON u.key = s.key AND u.owner_id = ?
       WHERE s.key = 'tts.global.speed' AND s.owner_id = ?`,
      ownerId, SYSTEM_USER_ID
    );
    const pitchRow = await this.db.queryFirst<{ value: string }>(
      `SELECT COALESCE(u.value, s.value) as value
       FROM settings s
       LEFT JOIN settings u ON u.key = s.key AND u.owner_id = ?
       WHERE s.key = 'tts.global.pitch' AND s.owner_id = ?`,
      ownerId, SYSTEM_USER_ID
    );
    const speed = version.speed ?? parseFloat(speedRow?.value ?? "1.0");
    const pitch = version.pitch ?? parseInt(pitchRow?.value ?? "0", 10);

    return this.synthesize(sentence.text, voice, speed, pitch);
  }

  async getByParams(text: string, voice: string, speed: number, pitch: number): Promise<TTSResult> {
    return this.synthesize(text, voice, speed, pitch);
  }

  private async synthesize(
    text: string, voice: string, speed: number, pitch: number
  ): Promise<TTSResult> {
    const cacheKey = await computeCacheKey(text, voice, speed, pitch);

    // Check storage cache
    const cached = await this.storage.get(cacheKey);
    if (cached) {
      const chunks: Uint8Array[] = [];
      const reader = cached.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      return { audio: out.buffer as ArrayBuffer, cacheHit: true, cacheKey };
    }

    // Generate via TTS provider
    const audio = await this.tts.synthesize(text, voice, speed, pitch);

    // Cache result
    await this.storage.put(cacheKey, audio, { contentType: "audio/mpeg" });

    return { audio, cacheHit: false, cacheKey };
  }

  async getCacheStats(): Promise<CacheStats> {
    const objects = await this.storage.list("tts/");
    const totalBytes = objects.reduce((n, o) => n + o.size, 0);
    return {
      fileCount: objects.length,
      totalBytes,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
    };
  }

  async clearCache(): Promise<{ deletedFiles: number; bytesFreed: number }> {
    const objects = await this.storage.list("tts/");
    let bytesFreed = 0;
    for (const obj of objects) {
      bytesFreed += obj.size;
      await this.storage.delete(obj.key);
    }
    await this.db.run("UPDATE sentences SET tts_cache_key = NULL");
    return { deletedFiles: objects.length, bytesFreed };
  }
}
