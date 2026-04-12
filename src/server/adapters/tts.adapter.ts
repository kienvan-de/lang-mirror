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
 * Uses node-edge-tts which writes to a temp file then reads it back.
 * Wraps the result into a ReadableStream to conform to ITTSProvider.
 *
 * The server keeps the process alive for its entire lifetime so buffering
 * the full audio here (via node-edge-tts's file-based API) is acceptable —
 * no waitUntil/tee needed on the desktop.
 */
export class NodeEdgeTTSAdapter implements ITTSProvider {
  constructor(private tmpDir: string) {
    mkdirSync(tmpDir, { recursive: true });
  }

  async synthesize(
    text: string,
    voice: string,
    speed: number,
    pitch: number,
  ): Promise<ReadableStream<Uint8Array>> {
    const tmpPath = join(
      this.tmpDir,
      `_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`
    );

    const tts = new EdgeTTS({
      voice,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate:  speedToRate(speed),
      pitch: pitchToEdge(pitch),
    });

    await tts.ttsPromise(text, tmpPath);

    const buffer = readFileSync(tmpPath);
    try { unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }

    // Wrap the Buffer into a single-chunk ReadableStream
    const bytes = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );

    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }
}
