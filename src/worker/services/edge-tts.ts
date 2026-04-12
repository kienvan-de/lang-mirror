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

import {
  TRUSTED_CLIENT_TOKEN,
  WSS_URL,
  WSS_HEADERS,
  SEC_MS_GEC_VERSION,
} from "./edge-tts-constants";

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

async function generateSecMsGec(): Promise<string> {
  let ticks = getUnixTimestamp();
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;          // convert to 100-nanosecond intervals

  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(strToHash),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Adjust clock skew from a failed HTTP response's Date header.
 * Called on 403/404 before retrying so the next Sec-MS-GEC is computed
 * with a timestamp that matches Microsoft's server clock.
 */
function adjustClockSkew(response: Response): void {
  try {
    const serverDate = response.headers.get("date");
    if (!serverDate) return;
    const serverTs = new Date(serverDate).getTime() / 1e3;
    const clientTs = getUnixTimestamp();
    clockSkewSeconds += serverTs - clientTs;
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
): Promise<ReadableStream<Uint8Array>> {
  const secMsGec = await generateSecMsGec();
  const reqId    = connectId();

  const url =
    `${WSS_URL}` +
    `&Sec-MS-GEC=${encodeURIComponent(secMsGec)}` +
    `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}` +
    `&ConnectionId=${reqId}`;

  const { ws } = await openWebSocket(url, {
    ...WSS_HEADERS,
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
  speed?: number;   // 0.5–2.0, default 1.0
  pitch?: number;   // semitones, default 0
  volume?: number;  // 0–100 percentage, default 100
}

/**
 * Synthesise speech via Edge TTS WebSocket and return audio as a ReadableStream.
 *
 * Retries up to 3 times on 403/404 (Microsoft's servers are occasionally flaky)
 * and adjusts the clock skew from the server's Date header on each failure so
 * the next Sec-MS-GEC token is computed with a correct timestamp.
 */
export async function synthesize(opts: SynthesizeOptions): Promise<ReadableStream<Uint8Array>> {
  const {
    text,
    voice,
    speed  = 1.0,
    pitch  = 0,
    volume = 100,
  } = opts;

  const rate      = speedToRate(speed);
  const pitchStr  = pitchToHz(pitch);
  const volumeStr = `+${Math.max(0, Math.min(100, volume))}%`;

  let lastError: Error = new Error("Edge TTS: unknown error");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await synthesizeOnce(text, voice, rate, pitchStr, volumeStr);
    } catch (err) {
      lastError = err as Error;
      const status = (err as { status?: number }).status;

      if (status === 403 || status === 404) {
        // Adjust clock skew from the failed response's Date header then retry
        const resp = (err as { response?: Response }).response;
        if (resp) adjustClockSkew(resp);
        console.warn(`[edge-tts] attempt ${attempt + 1} failed (${status}), retrying with adjusted clock skew`);
        continue;
      }

      // Non-recoverable error — throw immediately
      throw err;
    }
  }

  throw lastError;
}
