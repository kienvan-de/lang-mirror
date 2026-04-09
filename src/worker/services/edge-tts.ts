/**
 * CF-native Microsoft Edge TTS client.
 *
 * Uses the CF Workers fetch() WebSocket upgrade pattern which allows sending
 * custom headers on the WebSocket handshake — unlike new WebSocket(url) in
 * browsers which cannot set custom headers.
 *
 * Protocol reference: rany2/edge-tts (Python) + travisvn/edge-tts-universal (JS)
 */

import {
  TRUSTED_CLIENT_TOKEN,
  WSS_URL,
  WSS_HEADERS,
  SEC_MS_GEC_VERSION,
} from "./edge-tts-constants";

// ── Sec-MS-GEC token computation ──────────────────────────────────────────────
// Uses Web Crypto API — available natively in CF Workers

const WIN_EPOCH = 11644473600n;   // seconds between Windows epoch and Unix epoch
const S_TO_100NS = 10_000_000n;  // 1 second = 10,000,000 × 100-nanosecond intervals

async function computeSecMsGec(): Promise<string> {
  let ticks = BigInt(Math.floor(Date.now() / 1000)) + WIN_EPOCH;
  // Round down to nearest 300-second boundary
  ticks -= ticks % 300n;
  ticks *= S_TO_100NS;

  const input = `${ticks}${TRUSTED_CLIENT_TOKEN}`;
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function generateMuid(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function generateConnId(): string {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

// ── SSML builder ──────────────────────────────────────────────────────────────

function speedToRate(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function pitchToHz(semitones: number): string {
  return semitones >= 0 ? `+${semitones}Hz` : `${semitones}Hz`;
}

function buildSSML(text: string, voice: string, rate: string, pitch: string): string {
  // Escape XML special characters in text
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rate}' pitch='${pitch}'>${escaped}</prosody>` +
    `</voice></speak>`
  );
}

// ── Audio binary parsing ───────────────────────────────────────────────────────
// Edge TTS binary messages: [2-byte header length][header bytes][audio bytes]
// Header ends with the bytes for "Path:audio\r\n\r\n"

const AUDIO_PATH_MARKER = new TextEncoder().encode("Path:audio\r\n");

function findAudioStart(data: Uint8Array): number {
  // First 2 bytes are the header length (big-endian uint16)
  if (data.length < 2) return -1;
  const headerLen = (data[0]! << 8) | data[1]!;
  // Audio data starts after the 2-byte prefix + header
  const audioStart = 2 + headerLen;
  if (audioStart >= data.length) return -1;
  return audioStart;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// ── WebSocket connection — CF runtime vs local dev (Miniflare/Node) ───────────

/**
 * Open a WebSocket with custom headers.
 *
 * In real CF Workers: use the fetch() upgrade pattern which allows arbitrary
 * headers on the HTTP/1.1 Upgrade request (CF proprietary, not available in browsers).
 *
 * In Miniflare local dev / Node.js 22+: use the native WebSocket constructor
 * with a headers option (3rd argument), which Node supports since v22.
 *
 * Both paths end up with a standard WebSocket object.
 */
async function openWebSocket(url: string, headers: Record<string, string>): Promise<WebSocket> {
  // CF Workers runtime only — fetch() upgrade pattern with custom headers.
  // NOTE: This does NOT work in Miniflare local dev. Test TTS on deployed CF Worker.
  const resp = await fetch(url, {
    headers: {
      ...headers,
      "Upgrade": "websocket",
      "Sec-WebSocket-Version": "13",
    },
  });

  const cfWs = (resp as unknown as { webSocket?: WebSocket }).webSocket;
  if (!cfWs) {
    throw new Error(
      `Edge TTS: WebSocket upgrade failed (HTTP ${resp.status}). ` +
      `TTS only works on deployed CF Workers, not in Miniflare local dev.`
    );
  }

  (cfWs as unknown as { accept(): void }).accept();
  return cfWs;
}

// ── WebSocket message builders ─────────────────────────────────────────────────

function speechConfigMessage(): string {
  const config = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: false,
            wordBoundaryEnabled: false,
          },
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        },
      },
    },
  };
  return (
    `X-Timestamp:${new Date().toUTCString()}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify(config)
  );
}

function ssmlMessage(requestId: string, ssml: string): string {
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toUTCString()}\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml
  );
}

// ── Main synthesis function ────────────────────────────────────────────────────

export interface SynthesizeOptions {
  text: string;
  voice: string;
  speed?: number;  // 0.5–2.0, default 1.0
  pitch?: number;  // semitones, default 0
}

export async function synthesize(opts: SynthesizeOptions): Promise<ArrayBuffer> {
  const { text, voice, speed = 1.0, pitch = 0 } = opts;

  const secMsGec = await computeSecMsGec();
  const connId = generateConnId();
  const muid = generateMuid();

  const url =
    `${WSS_URL}` +
    `&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${connId}`;

  // Open WebSocket with custom headers.
  // Two paths:
  //   1. Real CF Workers runtime  → fetch() upgrade pattern (resp.webSocket)
  //   2. Miniflare local dev / Node → native WebSocket constructor with headers option
  const ws = await openWebSocket(url, {
    ...WSS_HEADERS,
    "Cookie": `muid=${muid};`,
  });

  const ssml = buildSSML(text, voice, speedToRate(speed), pitchToHz(pitch));
  const requestId = connId;

  // Send speech config first
  ws.send(speechConfigMessage());
  // Then send the SSML synthesis request
  ws.send(ssmlMessage(requestId, ssml));

  // Collect binary audio chunks until turn.end
  const chunks: Uint8Array[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Edge TTS: synthesis timed out after 30s"));
    }, 30_000);

    ws.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data === "string") {
        // Text message — check for turn.end signal
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          resolve();
        }
      } else {
        // Binary message — extract audio payload
        const data = new Uint8Array(event.data as ArrayBuffer);
        const audioStart = findAudioStart(data);
        if (audioStart !== -1) {
          chunks.push(data.slice(audioStart));
        }
      }
    });

    ws.addEventListener("error", (event) => {
      clearTimeout(timeout);
      reject(new Error(`Edge TTS WebSocket error: ${JSON.stringify(event)}`));
    });

    ws.addEventListener("close", () => {
      clearTimeout(timeout);
      if (chunks.length > 0) resolve();
      else reject(new Error("Edge TTS: connection closed before audio received"));
    });
  });

  return concatChunks(chunks).buffer as ArrayBuffer;
}
