import type { ITTSProvider } from "../../core/ports/tts.port";
import type { EdgeTTSConfig } from "../../core/services/settings.service";
import { synthesize } from "../services/edge-tts";

/**
 * CF Workers Edge TTS adapter — implements ITTSProvider using the
 * Microsoft Edge TTS WebSocket service via CF Workers fetch() upgrade pattern.
 *
 * Receives EdgeTTSConfig (resolved from DB settings) so volatile protocol
 * constants (token, chromium version, origin) can be updated without redeploy.
 *
 * Note: Only works on deployed CF Workers, not in Miniflare local dev.
 */
export class EdgeTTSAdapter implements ITTSProvider {
  constructor(private config: EdgeTTSConfig) {}

  async synthesize(
    text: string,
    voice: string,
    speed: number,
    pitch: number,
  ): Promise<ReadableStream<Uint8Array>> {
    return synthesize({ text, voice, speed, pitch, config: this.config });
  }
}
