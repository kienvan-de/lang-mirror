import { EdgeTTS } from "node-edge-tts";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { TTS_CACHE_DIR } from "../lib/data-dir";

export interface TTSOptions {
  text: string;
  voice: string; // e.g. "ja-JP-NanamiNeural"
  speed?: number; // 0.5–2.0, default 1.0
  pitch?: number; // -10 to +10 semitones, default 0
}

export interface TTSResult {
  audio: Buffer;
  cacheHit: boolean;
  cacheKey: string;
}

// --- Cache helpers ---

/**
 * Compute a deterministic SHA256-based filename for the given TTS parameters.
 * Returns a 16-char hex string + ".mp3".
 */
export function getCacheKey(text: string, voice: string, speed: number, pitch: number): string {
  const hash = createHash("sha256")
    .update(`${text}|${voice}|${speed}|${pitch}`)
    .digest("hex")
    .slice(0, 16);
  return `${hash}.mp3`;
}

function getCachePath(key: string): string {
  return join(TTS_CACHE_DIR, key);
}

export function getCachedAudio(key: string): Buffer | null {
  const path = getCachePath(key);
  if (existsSync(path)) {
    return readFileSync(path);
  }
  return null;
}

export function writeCacheAudio(key: string, buffer: Buffer): void {
  if (!existsSync(TTS_CACHE_DIR)) {
    mkdirSync(TTS_CACHE_DIR, { recursive: true });
  }
  writeFileSync(getCachePath(key), buffer);
}

export function deleteCacheFile(key: string): boolean {
  const path = getCachePath(key);
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

// --- Format converters ---

/**
 * Convert a speed multiplier (e.g. 1.2) to Edge TTS rate string (e.g. "+20%").
 * Edge TTS expects a percentage relative to 1.0 (default).
 */
function speedToRate(speed: number): string {
  const percent = Math.round((speed - 1.0) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

/**
 * Convert pitch in semitones (e.g. +2) to Edge TTS pitch string (e.g. "+2st").
 */
function pitchToEdge(pitch: number): string {
  return pitch >= 0 ? `+${pitch}st` : `${pitch}st`;
}

// --- Core TTS generation ---

/**
 * Generate TTS audio for the given options.
 * Returns a Buffer of MP3 data.
 * Checks the disk cache first; writes to cache on a miss.
 */
export async function generateTTS(opts: TTSOptions): Promise<TTSResult> {
  const speed = opts.speed ?? 1.0;
  const pitch = opts.pitch ?? 0;

  const cacheKey = getCacheKey(opts.text, opts.voice, speed, pitch);
  const cached = getCachedAudio(cacheKey);

  if (cached) {
    return { audio: cached, cacheHit: true, cacheKey };
  }

  // Generate to a temp file (node-edge-tts writes to disk, not a stream/buffer)
  const tmpPath = join(TTS_CACHE_DIR, `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  const tts = new EdgeTTS({
    voice: opts.voice,
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    rate: speedToRate(speed),
    pitch: pitchToEdge(pitch),
  });

  await tts.ttsPromise(opts.text, tmpPath);

  // Read generated file into buffer
  const audio = readFileSync(tmpPath);

  // Rename to final cache key
  writeCacheAudio(cacheKey, audio);

  // Clean up temp file (may already be the same as cache path in some edge cases)
  try {
    unlinkSync(tmpPath);
  } catch {
    // ignore if already moved/renamed
  }

  return { audio, cacheHit: false, cacheKey };
}
