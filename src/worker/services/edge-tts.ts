/**
 * CF-native Microsoft Edge TTS client.
 *
 * Ported from edge-tts-universal isomorphic.js (AGPL-3.0).
 * Matches IsomorphicCommunicate._stream() exactly — see scripts/edge-tts-worker.js
 * for the verified PoC this implementation is based on.
 *
 * Uses the CF Workers fetch() WebSocket upgrade pattern which allows sending
 * custom headers on the WebSocket handshake (not possible with new WebSocket()
 * in browsers or standard runtimes).
 */

import { BASE_URL } from "./edge-tts-constants";
import type { EdgeTTSConfig } from "../../core/services/settings.service";

// ── DRM — Sec-MS-GEC token (matches IsomorphicDRM exactly) ───────────────────

const WIN_EPOCH = 11644473600;   // seconds between Windows epoch and Unix epoch
const S_TO_NS   = 1e9;

/**
 * Clock skew in seconds between this Worker and Microsoft's servers.
 * Adjusted whenever a 403/404 response includes a Date header.
 * Persists for the lifetime of the Worker instance (across requests in the same isolate).
 */
let clockSkewSeconds = 0;

function getUnixTimestamp(): number {
  return Date.now() / 1e3 + clockSkewSeconds;
}

async function generateSecMsGec(token: string): Promise<string> {
  let ticks = getUnixTimestamp();
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;          // convert to 100-nanosecond intervals

  const strToHash = `${ticks.toFixed(0)}${token}`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(strToHash),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Build WSS headers from runtime config — volatile fields come from DB */
function buildWSSHeaders(config: EdgeTTSConfig): Record<string, string> {
  const major = config.chromiumVersion.split(".")[0]!;
  return {
    "User-Agent":            `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
    "Accept-Encoding":       "gzip, deflate, br, zstd",
    "Accept-Language":       "en-US,en;q=0.9",
    "Pragma":                "no-cache",
    "Cache-Control":         "no-cache",
    "Origin":                config.origin,
    "Sec-WebSocket-Version": "13",
  };
}

/**
 * Sync clock skew from a 403/404 response's Date header.
 * Microsoft's Sec-MS-GEC token is time-sensitive — a mismatch between the
 * Worker clock and Microsoft's server clock causes 403/404 rejections.
 * Reading the Date header from the failed response gives us the server's
 * current time, letting us recompute a correct token for one retry.
 */
function syncClockFromResponse(response: Response): void {
  try {
    const serverDate = response.headers.get("date");
    if (!serverDate) return;
    const serverTs = new Date(serverDate).getTime() / 1e3;
    // Replace the accumulated skew with the precise delta from this response
    clockSkewSeconds = serverTs - (Date.now() / 1e3);
  } catch { /* ignore parse errors */ }
}

// ── ID / timestamp helpers (matches lib verbatim) ─────────────────────────────

/**
 * UUID v4 without dashes, lowercase — version/variant bits set correctly.
 * The lib generates this with crypto.getRandomValues() rather than
 * crypto.randomUUID() to ensure the correct bit pattern.
 */
function connectId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  array[6] = (array[6]! & 0x0f) | 0x40;  // version 4
  array[8] = (array[8]! & 0x3f) | 0x80;  // variant bits
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

function generateMuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Timestamp format expected by the Edge TTS service.
 * ISO-8601 with all separators removed, no trailing Z — the Z is appended
 * explicitly in the header value.
 * e.g. "20240115T123456789"
 */
function dateToString(): string {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, -1);
}

// ── SSML builder (matches mkssml + escape verbatim) ──────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function speedToRate(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function pitchToHz(semitones: number): string {
  return semitones >= 0 ? `+${semitones}Hz` : `${semitones}Hz`;
}

/**
 * Build SSML — attribute order matches the lib exactly:
 * pitch → rate → volume (prosody attributes must be in this order).
 */
function mkssml(
  voice: string, rate: string, volume: string, pitch: string, text: string,
): string {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

// ── Message builders (matches lib verbatim) ───────────────────────────────────

function speechConfigMessage(): string {
  // NOTE: metadataoptions values are strings "false"/"true", not booleans —
  // this matches the lib exactly; using JS booleans produces a different JSON payload.
  const payload = JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: "false",
            wordBoundaryEnabled:     "true",
          },
          outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        },
      },
    },
  });
  // Trailing \r\n after JSON — required by the protocol
  return (
    `X-Timestamp:${dateToString()}Z\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    payload + "\r\n"
  );
}

function ssmlHeadersPlusData(requestId: string, ssml: string): string {
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${dateToString()}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml
  );
}

// ── Binary frame parser (matches isomorphicGetHeadersAndDataFromBinary) ────────

interface BinaryFrameHeaders { [key: string]: string }

function parseBinaryFrame(bytes: Uint8Array): [BinaryFrameHeaders, Uint8Array] {
  const headerLength = (bytes[0]! << 8) | bytes[1]!;
  const headers: BinaryFrameHeaders = {};
  if (headerLength > 0 && headerLength + 2 <= bytes.length) {
    const headerStr = new TextDecoder().decode(bytes.slice(2, headerLength + 2));
    for (const line of headerStr.split("\r\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        headers[line.slice(0, colonIdx)] = line.slice(colonIdx + 1).trim();
      }
    }
  }
  return [headers, bytes.slice(headerLength + 2)];
}

/** Parse headers from a text WebSocket frame (header block ends at \r\n\r\n) */
function parseTextFrame(data: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerEnd = data.indexOf("\r\n\r\n");
  const block = headerEnd !== -1 ? data.substring(0, headerEnd) : data;
  for (const line of block.split("\r\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      headers[line.slice(0, colonIdx)] = line.slice(colonIdx + 1).trim();
    }
  }
  return headers;
}

// ── WebSocket connection ───────────────────────────────────────────────────────

async function openWebSocket(
  url: string,
  headers: Record<string, string>,
): Promise<{ ws: WebSocket; response: Response }> {
  // CF Workers: replace wss:// with https:// for the fetch() upgrade pattern.
  // The runtime detects the Upgrade header and performs the WebSocket handshake.
  const resp = await fetch(url.replace("wss://", "https://"), {
    headers: {
      "Upgrade": "websocket",
      ...headers,
    },
  });

  const cfWs = (resp as unknown as { webSocket?: WebSocket }).webSocket;
  if (!cfWs) {
    // Return the raw response so the caller can read the Date header for clock skew
    const err = Object.assign(
      new Error(`Edge TTS: WebSocket upgrade failed (HTTP ${resp.status})`),
      { status: resp.status, response: resp },
    );
    throw err;
  }

  (cfWs as unknown as { accept(): void }).accept();
  return { ws: cfWs, response: resp };
}

// ── Core synthesize (single attempt) ──────────────────────────────────────────

async function synthesizeOnce(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume = "+0%",
  config: EdgeTTSConfig,
): Promise<ReadableStream<Uint8Array>> {
  const secMsGec       = await generateSecMsGec(config.token);
  const secMsGecVersion = `1-${config.chromiumVersion}`;
  const reqId           = connectId();
  const wssUrl          = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${encodeURIComponent(config.token)}`;

  const url =
    `${wssUrl}` +
    `&Sec-MS-GEC=${encodeURIComponent(secMsGec)}` +
    `&Sec-MS-GEC-Version=${encodeURIComponent(secMsGecVersion)}` +
    `&ConnectionId=${reqId}`;

  const { ws } = await openWebSocket(url, {
    ...buildWSSHeaders(config),
    Cookie: `muid=${generateMuid()};`,
  });

  const ssml = mkssml(voice, rate, volume, pitch, text);

  ws.send(speechConfigMessage());
  ws.send(ssmlHeadersPlusData(reqId, ssml));

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const timeout = setTimeout(() => {
        controller.error(new Error("Edge TTS: synthesis timed out after 30s"));
        try { ws.close(); } catch { /* ignore */ }
      }, 30_000);

      const processBinary = (bytes: Uint8Array) => {
        const [headers, audioData] = parseBinaryFrame(bytes);
        // Only accept audio/mpeg frames with a non-empty payload
        if (headers["Path"] !== "audio") return;
        if (headers["Content-Type"] !== "audio/mpeg") return;
        if (audioData.length === 0) return;
        controller.enqueue(audioData);
      };

      ws.addEventListener("message", (event: MessageEvent) => {
        const data = event.data;

        if (typeof data === "string") {
          const headers = parseTextFrame(data);
          if (headers["Path"] === "turn.end") {
            clearTimeout(timeout);
            try { controller.close(); } catch { /* already closed */ }
          }
          // turn.start, response, audio.metadata — safely ignored
        } else if (typeof Blob !== "undefined" && data instanceof Blob) {
          // CF Workers can deliver binary frames as Blob
          data.arrayBuffer().then(buf => processBinary(new Uint8Array(buf)));
        } else if (data instanceof ArrayBuffer) {
          processBinary(new Uint8Array(data));
        } else if (data instanceof Uint8Array) {
          processBinary(data);
        }
      });

      ws.addEventListener("error", (event) => {
        clearTimeout(timeout);
        controller.error(new Error(`Edge TTS WebSocket error: ${JSON.stringify(event)}`));
      });

      ws.addEventListener("close", () => {
        clearTimeout(timeout);
        try { controller.close(); } catch { /* already closed */ }
      });
    },

    cancel() {
      try { ws.close(); } catch { /* ignore */ }
    },
  });
}

// ── Public API — with retry + clock skew adjustment ───────────────────────────

export interface SynthesizeOptions {
  text: string;
  voice: string;
  speed?: number;           // 0.5–2.0, default 1.0
  pitch?: number;           // semitones, default 0
  volume?: number;          // 0–100 percentage, default 100
  config: EdgeTTSConfig;    // resolved from DB settings by TTSService
}

/**
 * Synthesise speech via Edge TTS WebSocket and return audio as a ReadableStream.
 *
 * On 403/404: the Sec-MS-GEC token is time-sensitive — the rejection means our
 * Worker clock differs from Microsoft's. We sync the clock exactly once from the
 * Date header of the failed response, then retry once with a freshly computed token.
 * If the retry also fails we surface the error immediately — no further attempts.
 */
export async function synthesize(opts: SynthesizeOptions): Promise<ReadableStream<Uint8Array>> {
  const {
    text,
    voice,
    speed  = 1.0,
    pitch  = 0,
    volume = 100,
    config,
  } = opts;

  const rate      = speedToRate(speed);
  const pitchStr  = pitchToHz(pitch);
  const volumeStr = `+${Math.max(0, Math.min(100, volume))}%`;

  try {
    return await synthesizeOnce(text, voice, rate, pitchStr, volumeStr, config);
  } catch (err) {
    const status = (err as { status?: number }).status;

    // 403/404 = clock skew — sync from the response Date header and retry once
    if (status === 403 || status === 404) {
      const resp = (err as { response?: Response }).response;
      if (resp) {
        syncClockFromResponse(resp);
        console.warn(`[edge-tts] ${status} — clock synced from server Date header, retrying once`);
      }
      // Second attempt with corrected clock — let any error propagate to caller
      return await synthesizeOnce(text, voice, rate, pitchStr, volumeStr, config);
    }

    // Any other error — propagate immediately
    throw err;
  }
}
