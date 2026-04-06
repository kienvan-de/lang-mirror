import { error } from "../lib/response";
import { db } from "../db/client";
import { DATA_DIR } from "../lib/data-dir";
import { homedir } from "os";

interface TopicRow { id: string; title: string; description: string | null; created_at: string; updated_at: string }
interface VersionRow { id: string; topic_id: string; language_code: string; voice_name: string | null; speed: number | null; pitch: number | null; position: number; created_at: string; updated_at: string }
interface SentenceRow { id: string; version_id: string; text: string; translation: string | null; notes: string | null; position: number; tts_cache_key: string | null; created_at: string; updated_at: string }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // GET /api/export/all → ZIP of all topics as JSON files
  if (method === "GET" && path === "/api/export/all") {
    return exportAll();
  }

  // GET /api/export/:topicId → single topic as importable JSON
  const topicMatch = path.match(/^\/api\/export\/([^/]+)$/);
  if (method === "GET" && topicMatch) {
    return exportTopic(topicMatch[1]!);
  }

  return error("not found", 404);
}

// ── Shared: build importable topic payload ────────────────────────────────────

function buildTopicPayload(topic: TopicRow): object {
  const versions = db.prepare(
    "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC"
  ).all(topic.id) as VersionRow[];

  const enrichedVersions = versions.map((v) => {
    const sentences = db.prepare(
      "SELECT text, translation, notes FROM sentences WHERE version_id = ? ORDER BY position ASC"
    ).all(v.id) as Array<Pick<SentenceRow, "text" | "translation" | "notes">>;

    const versionObj: Record<string, unknown> = {
      language: v.language_code,
    };
    if (v.voice_name) versionObj["voice_name"] = v.voice_name;
    if (v.speed !== null) versionObj["speed"] = v.speed;
    if (v.pitch !== null) versionObj["pitch"] = v.pitch;
    versionObj["sentences"] = sentences.map((s) => {
      const obj: Record<string, unknown> = { text: s.text };
      if (s.translation) obj["translation"] = s.translation;
      if (s.notes) obj["notes"] = s.notes;
      return obj;
    });
    return versionObj;
  });

  const payload: Record<string, unknown> = { title: topic.title };
  if (topic.description) payload["description"] = topic.description;
  payload["versions"] = enrichedVersions;
  return payload;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "topic";
}

// ── GET /api/export/:topicId ──────────────────────────────────────────────────

function exportTopic(topicId: string): Response {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as TopicRow | undefined;
  if (!topic) return error(`Topic '${topicId}' not found`, 404);

  const payload = buildTopicPayload(topic);
  const json = JSON.stringify(payload, null, 2);
  const filename = `${slugify(topic.title)}.json`;

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(new TextEncoder().encode(json).length),
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── GET /api/export/all ───────────────────────────────────────────────────────

async function exportAll(): Promise<Response> {
  const topics = db.prepare("SELECT * FROM topics ORDER BY created_at ASC").all() as TopicRow[];

  // Build a ZIP in memory using Bun's built-in CompressionStream approach
  // Since Bun doesn't have a built-in JSZip, we build a simple ZIP manually
  // Format: local file header + data for each file, followed by central directory

  const files: Array<{ name: string; data: Uint8Array }> = [];

  for (const topic of topics) {
    const payload = buildTopicPayload(topic);
    const topicJson = JSON.stringify(payload, null, 2);
    const safeName = slugify(topic.title).slice(0, 60) || "topic";
    files.push({
      name: `${safeName}_${topic.id.slice(0, 8)}.json`,
      data: new TextEncoder().encode(topicJson),
    });
  }

  // Build manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    topicCount: topics.length,
    dataDir: DATA_DIR.replace(homedir(), "~"),
  };
  files.push({
    name: "manifest.json",
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  // Build ZIP binary manually (ZIP spec: PKZIP format)
  const zipBytes = buildZip(files);

  const timestamp = new Date().toISOString().slice(0, 10);
  return new Response(zipBytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="lang-mirror-export-${timestamp}.zip"`,
      "Content-Length": String(zipBytes.byteLength),
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── Minimal ZIP builder ───────────────────────────────────────────────────────

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralDirs: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1));
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 bytes + name)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);  // signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression (store)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);        // compressed size
    lv.setUint32(22, size, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra field length
    local.set(nameBytes, 30);

    localHeaders.push(local);
    localHeaders.push(file.data);

    // Central directory entry (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);  // signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // compression
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra
    cv.setUint16(32, 0, true);           // comment
    cv.setUint16(34, 0, true);           // disk start
    cv.setUint16(36, 0, true);           // internal attr
    cv.setUint32(38, 0, true);           // external attr
    cv.setUint32(42, offset, true);      // local header offset
    central.set(nameBytes, 46);

    centralDirs.push(central);
    offset += local.length + file.data.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralDirs.reduce((s, c) => s + c.length, 0);

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  // Concatenate all parts
  const allParts = [...localHeaders, ...centralDirs, eocd];
  const totalSize = allParts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of allParts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

// CRC-32 implementation
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of data) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
