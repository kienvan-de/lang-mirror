/**
 * Constants for the Microsoft Edge TTS WebSocket service.
 * Protocol reverse-engineered — same values used by edge-tts-universal / rany2/edge-tts.
 * Updated to match Chrome/Edge 143 emulation (as of v1.4.0 of edge-tts-universal).
 */

export const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

export const CHROMIUM_FULL_VERSION = "143.0.3650.75";
export const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];

export const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

export const BASE_URL =
  "speech.platform.bing.com/consumer/speech/synthesize/readaloud";

export const WSS_URL =
  `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

export const VOICE_LIST_URL =
  `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 ` +
  `Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

/** Headers required on the WebSocket upgrade request */
export const WSS_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache",
  "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
};
