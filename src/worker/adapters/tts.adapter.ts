import type { ITTSProvider } from "../../core/ports/tts.port";
import { synthesize } from "../services/edge-tts";

/**
 * CF Workers Edge TTS adapter — implements ITTSProvider using the
 * Microsoft Edge TTS WebSocket service via CF Workers fetch() upgrade pattern.
 *
 * Note: Only works on deployed CF Workers, not in Miniflare local dev.
 */
export class EdgeTTSAdapter implements ITTSProvider {
  async synthesize(text: string, voice: string, speed: number, pitch: number): Promise<ArrayBuffer> {
    return synthesize({ text, voice, speed, pitch });
  }
}
