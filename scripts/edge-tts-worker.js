/**
 * Cloudflare Worker – Microsoft Edge TTS (PoC)
 * Ported from edge-tts-universal isomorphic.js (AGPL-3.0)
 * Matches the lib's IsomorphicCommunicate._stream() exactly.
 */

// ─── Constants (copied verbatim from lib) ─────────────────────────────────────
const BASE_URL             = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL              = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const VOICE_LIST_URL       = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
const CHROMIUM_FULL_VERSION  = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = "143";
const SEC_MS_GEC_VERSION   = `1-${CHROMIUM_FULL_VERSION}`;

// WSS_HEADERS exactly as lib defines them
const WSS_HEADERS = {
  "User-Agent":             `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  "Accept-Encoding":        "gzip, deflate, br, zstd",
  "Accept-Language":        "en-US,en;q=0.9",
  "Pragma":                 "no-cache",
  "Cache-Control":          "no-cache",
  "Origin":                 "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Sec-WebSocket-Version":  "13",
};

// ─── DRM (copied verbatim from IsomorphicDRM) ────────────────────────────────
const WIN_EPOCH = 11644473600;
const S_TO_NS   = 1e9;
let clockSkewSeconds = 0;

function getUnixTimestamp() {
  return Date.now() / 1e3 + clockSkewSeconds;
}

async function generateSecMsGec() {
  let ticks = getUnixTimestamp();
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(strToHash)
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("").toUpperCase();
}

function generateMuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// headersWithMuid: Cookie is lowercase "muid=", uppercase value, trailing semicolon
function headersWithMuid(headers) {
  return { ...headers, Cookie: `muid=${generateMuid()};` };
}

function handleClientResponseError(response) {
  try {
    const serverDate = response.headers?.get?.("date") || response.headers?.["date"] || response.headers?.["Date"];
    if (!serverDate) return;
    const serverTs = new Date(serverDate).getTime() / 1e3;
    const clientTs = getUnixTimestamp();
    clockSkewSeconds += serverTs - clientTs;
  } catch (_) {}
}

// ─── Utils (copied verbatim from lib) ────────────────────────────────────────

// connectId: UUID v4 without dashes (version/variant bits set)
function connectId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  array[6] = (array[6] & 0x0f) | 0x40; // version 4
  array[8] = (array[8] & 0x3f) | 0x80; // variant bits
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// dateToString: ISO format with no dashes/colons/dots, no trailing Z
function dateToString() {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, -1);
}

function escape(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mkssml(voice, rate, volume, pitch, text) {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${text}</prosody></voice></speak>`;
}

function ssmlHeadersPlusData(requestId, timestamp, ssml) {
  return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`;
}

// Binary frame parser (from isomorphicGetHeadersAndDataFromBinary)
function parseBinaryFrame(bytes) {
  const headerLength = (bytes[0] << 8) | bytes[1];
  const headers = {};
  if (headerLength > 0 && headerLength + 2 <= bytes.length) {
    const headerStr = new TextDecoder().decode(bytes.slice(2, headerLength + 2));
    for (const line of headerStr.split("\r\n")) {
      const [key, value] = line.split(":", 2);
      if (key && value) headers[key] = value.trim();
    }
  }
  return [headers, bytes.slice(headerLength + 2)];
}

// Text frame header parser
function parseTextFrame(data) {
  const headerEnd = data.indexOf("\r\n\r\n");
  const headers = {};
  if (headerEnd !== -1) {
    for (const line of data.substring(0, headerEnd).split("\r\n")) {
      const [key, value] = line.split(":", 2);
      if (key && value) headers[key] = value.trim();
    }
  }
  return headers;
}

// ─── Core synthesize ──────────────────────────────────────────────────────────
async function synthesize(text, voice = "en-US-EmmaMultilingualNeural", rate = "+0%", pitch = "+0Hz", volume = "+0%") {
  const secMsGec = await generateSecMsGec();
  const url = `${WSS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId()}`;

  // CF Workers: use fetch() upgrade to pass custom headers (new WebSocket() doesn't support headers)
  const resp = await fetch(url.replace("wss://", "https://"), {
    headers: {
      "Upgrade": "websocket",
      ...headersWithMuid(WSS_HEADERS),
    },
  });

  if (!resp.webSocket) {
    handleClientResponseError(resp);
    const body = await resp.text().catch(() => "");
    const err = new Error(`WebSocket upgrade rejected (${resp.status}): ${body}`);
    err.status = resp.status;
    throw err;
  }

  const ws = resp.webSocket;
  ws.accept();

  return new Promise((resolve, reject) => {
    const audioChunks = [];
    let audioWasReceived = false;
    let done = false;

    const processBinaryData = (bytes) => {
      const [headers, audioData] = parseBinaryFrame(bytes);
      if (headers["Path"] !== "audio") return;
      if (headers["Content-Type"] !== "audio/mpeg") return;
      if (audioData.length === 0) return;
      audioChunks.push(audioData);
      audioWasReceived = true;
    };

    ws.addEventListener("message", (event) => {
      const data = event.data;

      if (typeof data === "string") {
        const headers = parseTextFrame(data);
        const path = headers["Path"];
        if (path === "turn.end") {
          done = true;
          ws.close();
          if (!audioWasReceived) {
            reject(new Error("No audio received"));
            return;
          }
          const totalBytes = audioChunks.reduce((n, c) => n + c.length, 0);
          const result = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of audioChunks) { result.set(chunk, offset); offset += chunk.length; }
          resolve(result);
        }
        // ignore turn.start, response, audio.metadata for this simple PoC
      } else {
        // Binary — handle Blob (CF Workers) or ArrayBuffer/Uint8Array
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          data.arrayBuffer().then(buf => processBinaryData(new Uint8Array(buf)));
        } else if (data instanceof ArrayBuffer) {
          processBinaryData(new Uint8Array(data));
        } else if (data instanceof Uint8Array) {
          processBinaryData(data);
        }
      }
    });

    ws.addEventListener("error", (e) => {
      reject(new Error(`WebSocket error: ${e.message || JSON.stringify(e)}`));
    });

    ws.addEventListener("close", () => {
      if (!done) {
        if (audioWasReceived) {
          done = true;
          const totalBytes = audioChunks.reduce((n, c) => n + c.length, 0);
          const result = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of audioChunks) { result.set(chunk, offset); offset += chunk.length; }
          resolve(result);
        } else {
          reject(new Error("WebSocket closed with no audio"));
        }
      }
    });

    // Send speech.config exactly as the lib does (note trailing \r\n)
    ws.send(
      `X-Timestamp:${dateToString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}` + "\r\n"
    );

    // Send SSML exactly as the lib does
    ws.send(
      ssmlHeadersPlusData(
        connectId(),
        dateToString(),
        mkssml(voice, rate, volume, pitch, escape(text))
      )
    );

    setTimeout(() => { if (!done) reject(new Error("TTS timeout after 30s")); }, 30_000);
  });
}

// Retry up to 3 times on 403/404 — Microsoft's server is occasionally flaky
// and the lib itself has open issues about this. Clock skew is adjusted each attempt.
async function synthesizeWithRetry(text, voice, rate, pitch) {
  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      return await synthesize(text, voice, rate, pitch);
    } catch (e) {
      lastError = e;
      // e.status is set below; also check message as fallback
      if (e.status === 403 || e.status === 404 ||
          e.message.includes("403") || e.message.includes("404") ||
          e.message.includes("rejected")) {
        console.log(`TTS attempt ${i + 1} failed (${e.message}), retrying...`);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// ─── Voice list ───────────────────────────────────────────────────────────────
async function fetchVoices() {
  const secMsGec = await generateSecMsGec();
  const url = `${VOICE_LIST_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":        WSS_HEADERS["User-Agent"],
      "Accept-Encoding":   WSS_HEADERS["Accept-Encoding"],
      "Accept-Language":   WSS_HEADERS["Accept-Language"],
      "Accept":            "*/*",
    },
  });
  if (!res.ok) throw new Error(`Voice list fetch failed: ${res.status}`);
  return res.json();
}

// ─── Test HTML ────────────────────────────────────────────────────────────────
const TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Edge TTS – CF Worker PoC</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    textarea { width: 100%; height: 100px; font-size: 1rem; }
    select, input, button { font-size: 1rem; margin-top: .5rem; }
    button { padding: .4rem 1.2rem; cursor: pointer; }
    audio { display: block; margin-top: 1rem; width: 100%; }
    #status { margin-top: .5rem; color: #555; font-size: .9rem; min-height: 1.2em; }
  </style>
</head>
<body>
  <h1>🗣 Edge TTS – Cloudflare Worker PoC</h1>
  <textarea id="text">Hello! This is a Cloudflare Worker powered by Microsoft Edge TTS.</textarea>
  <br/>
  <label>Voice:
    <select id="voice">
      <option value="en-US-EmmaMultilingualNeural">en-US-EmmaMultilingualNeural</option>
      <option value="en-US-GuyNeural">en-US-GuyNeural</option>
      <option value="en-GB-SoniaNeural">en-GB-SoniaNeural</option>
      <option value="vi-VN-HoaiMyNeural">vi-VN-HoaiMyNeural</option>
    </select>
  </label>
  <br/>
  <label>Rate: <input id="rate" value="+0%" style="width:6rem"/></label>
  <label style="margin-left:1rem">Pitch: <input id="pitch" value="+0Hz" style="width:6rem"/></label>
  <br/>
  <button onclick="speak()">▶ Synthesise</button>
  <p id="status"></p>
  <audio id="player" controls></audio>
  <script>
    async function speak() {
      const text  = document.getElementById("text").value.trim();
      const voice = document.getElementById("voice").value;
      const rate  = document.getElementById("rate").value;
      const pitch = document.getElementById("pitch").value;
      const status = document.getElementById("status");
      const player = document.getElementById("player");
      if (!text) { alert("Please enter text."); return; }
      status.textContent = "⏳ Synthesising…";
      try {
        const res = await fetch("/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice, rate, pitch }),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        player.src = URL.createObjectURL(blob);
        player.play();
        status.textContent = "✅ Done!";
      } catch (e) {
        status.textContent = "❌ " + e.message;
      }
    }
  </script>
</body>
</html>`;

// ─── Router ───────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(TEST_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/voices" && request.method === "GET") {
      try {
        const voices = await fetchVoices();
        return new Response(JSON.stringify(voices, null, 2), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
    }

    if (url.pathname === "/tts" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

      const { text, voice = "en-US-EmmaMultilingualNeural", rate = "+0%", pitch = "+0Hz" } = body;
      if (!text || typeof text !== "string") {
        return new Response(JSON.stringify({ error: "text is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      try {
        const audio = await synthesizeWithRetry(text.slice(0, 3000), voice, rate, pitch);
        return new Response(audio, {
          headers: { "Content-Type": "audio/mpeg", "Content-Length": String(audio.byteLength), ...CORS },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
