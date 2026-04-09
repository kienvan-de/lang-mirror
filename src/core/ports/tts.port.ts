/**
 * Platform-agnostic TTS synthesis interface.
 *
 * Implemented by:
 *   - NodeEdgeTTSAdapter  (src/server/adapters/tts.adapter.ts)  — node-edge-tts (Bun/Node)
 *   - EdgeTTSAdapter      (src/worker/adapters/tts.adapter.ts)  — CF Workers fetch() WebSocket
 */
export interface ITTSProvider {
  /**
   * Synthesise speech and return raw MP3 audio as ArrayBuffer.
   *
   * @param text   — the text to speak (max 2000 chars)
   * @param voice  — Neural voice name e.g. "en-US-JennyNeural"
   * @param speed  — playback rate 0.5–2.0 (1.0 = normal)
   * @param pitch  — pitch adjustment in semitones -10–+10 (0 = normal)
   */
  synthesize(text: string, voice: string, speed: number, pitch: number): Promise<ArrayBuffer>;
}
