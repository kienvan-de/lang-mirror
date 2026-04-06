import { db } from "../db/client";
import { generateTTS } from "./tts.service";
import { preloadProgress } from "../routes/tts";

interface SentenceRow {
  id: string;
  text: string;
  tts_cache_key: string | null;
}

interface VersionRow {
  id: string;
  topic_id: string;
  language_code: string;
  voice_name: string | null;
  speed: number | null;
  pitch: number | null;
}

interface SettingRow {
  value: string;
}

function getSetting(key: string, fallback: string): string {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | SettingRow
      | undefined;
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

/** Default voice per language code — used when no voice is set on the version. */
const DEFAULT_VOICES: Record<string, string> = {
  en: "en-US-JennyNeural",
  ja: "ja-JP-NanamiNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ko: "ko-KR-SunHiNeural",
  pt: "pt-BR-FranciscaNeural",
  it: "it-IT-ElsaNeural",
  ru: "ru-RU-SvetlanaNeural",
};

function resolveVoice(version: VersionRow): string {
  if (version.voice_name) return version.voice_name;
  const langCode = version.language_code.split("-")[0]!.toLowerCase();
  return DEFAULT_VOICES[langCode] ?? "en-US-JennyNeural";
}

/**
 * Pre-generate and cache TTS for every sentence in a language version.
 * Runs sequentially to avoid rate-limiting the Edge TTS API.
 * Updates tts_cache_key in DB for each sentence.
 * Does NOT throw — errors per sentence are logged and skipped.
 */
export async function preloadVersionTTS(versionId: string): Promise<void> {
  const version = db
    .prepare("SELECT * FROM topic_language_versions WHERE id = ?")
    .get(versionId) as VersionRow | undefined;

  if (!version) {
    console.warn(`preloadVersionTTS: version ${versionId} not found`);
    return;
  }

  const sentences = db
    .prepare("SELECT id, text, tts_cache_key FROM sentences WHERE version_id = ? ORDER BY position ASC")
    .all(versionId) as SentenceRow[];

  const total = sentences.length;
  let done = 0;

  preloadProgress.set(versionId, { done, total, finished: false });

  const voice = resolveVoice(version);
  const speed = version.speed ?? parseFloat(getSetting("tts.global.speed", "1.0"));
  const pitch = version.pitch ?? parseInt(getSetting("tts.global.pitch", "0"), 10);

  const updateCacheKey = db.prepare(
    "UPDATE sentences SET tts_cache_key = ? WHERE id = ?"
  );

  for (const sentence of sentences) {
    try {
      const result = await generateTTS({ text: sentence.text, voice, speed, pitch });
      updateCacheKey.run(result.cacheKey, sentence.id);
      done++;
      preloadProgress.set(versionId, { done, total, finished: false });
    } catch (err) {
      console.error(`preloadVersionTTS: failed for sentence ${sentence.id}:`, err);
      done++;
      preloadProgress.set(versionId, { done, total, finished: false });
      // continue to next sentence
    }
  }

  preloadProgress.set(versionId, { done, total, finished: true });
  console.log(`✓ TTS preload complete for version ${versionId}: ${done}/${total} sentences`);
}
