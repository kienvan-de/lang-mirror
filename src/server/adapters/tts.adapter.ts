import { EdgeTTS } from "node-edge-tts";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, unlinkSync } from "fs";
import type { ITTSProvider } from "../../core/ports/tts.port";

function speedToRate(speed: number): string {
  const percent = Math.round((speed - 1.0) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function pitchToEdge(pitch: number): string {
  return pitch >= 0 ? `+${pitch}st` : `${pitch}st`;
}

/**
 * TTS adapter for the desktop (Bun) server.
 * Uses node-edge-tts which writes to a temp file, then reads it back as ArrayBuffer.
 */
export class NodeEdgeTTSAdapter implements ITTSProvider {
  constructor(private tmpDir: string) {
    mkdirSync(tmpDir, { recursive: true });
  }

  async synthesize(text: string, voice: string, speed: number, pitch: number): Promise<ArrayBuffer> {
    const tmpPath = join(
      this.tmpDir,
      `_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`
    );

    const tts = new EdgeTTS({
      voice,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate: speedToRate(speed),
      pitch: pitchToEdge(pitch),
    });

    await tts.ttsPromise(text, tmpPath);

    const buffer = readFileSync(tmpPath);

    try { unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }

    // Convert Node Buffer → ArrayBuffer
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
  }
}
