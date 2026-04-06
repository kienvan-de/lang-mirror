import { json, error } from "../lib/response";
import { db } from "../db/client";
import { RECORDINGS_DIR } from "../lib/data-dir";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, statSync, readdirSync, rmSync } from "fs";

interface SentenceRow {
  id: string;
  version_id: string;
  tts_cache_key: string | null;
}
interface VersionRow {
  id: string;
  topic_id: string;
  language_code: string;
}

function getRecordingPath(topicId: string, langCode: string, sentenceId: string, ext: string): string {
  return join(RECORDINGS_DIR, topicId, langCode, `sentence-${sentenceId}.${ext}`);
}

function findRecordingFile(topicId: string, langCode: string, sentenceId: string): { path: string; mimeType: string } | null {
  for (const [ext, mime] of [["webm", "audio/webm"], ["ogg", "audio/ogg"]] as const) {
    const p = getRecordingPath(topicId, langCode, sentenceId, ext);
    if (existsSync(p)) return { path: p, mimeType: mime };
  }
  return null;
}

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // DELETE /api/recordings — delete ALL recordings
  if (method === "DELETE" && path === "/api/recordings") {
    return deleteAllRecordings();
  }

  const match = path.match(/^\/api\/recordings\/([^/]+)$/);
  if (!match) return error("not found", 404);
  const sentenceId = match[1]!;

  if (method === "POST") return uploadRecording(req, sentenceId);
  if (method === "GET")  return getRecording(sentenceId);
  if (method === "DELETE") return deleteRecording(sentenceId);

  return error("method not allowed", 405);
}

// ── POST /api/recordings/:sentenceId ─────────────────────────────────────────

async function uploadRecording(req: Request, sentenceId: string): Promise<Response> {
  const sentence = db.prepare("SELECT * FROM sentences WHERE id = ?").get(sentenceId) as SentenceRow | undefined;
  if (!sentence) return error("Sentence not found", 404);

  const contentType = req.headers.get("Content-Type") ?? "";
  let ext: string;
  if (contentType.includes("webm")) ext = "webm";
  else if (contentType.includes("ogg")) ext = "ogg";
  else return error("Content-Type must be audio/webm or audio/ogg", 400);

  const version = db.prepare("SELECT * FROM topic_language_versions WHERE id = ?").get(sentence.version_id) as VersionRow | undefined;
  if (!version) return error("Version not found", 404);

  const dir = join(RECORDINGS_DIR, version.topic_id, version.language_code);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filePath = getRecordingPath(version.topic_id, version.language_code, sentenceId, ext);

  // Remove other extension if it exists (switching browsers)
  const otherExt = ext === "webm" ? "ogg" : "webm";
  const otherPath = getRecordingPath(version.topic_id, version.language_code, sentenceId, otherExt);
  if (existsSync(otherPath)) unlinkSync(otherPath);

  const buffer = await req.arrayBuffer();
  writeFileSync(filePath, new Uint8Array(buffer));

  return json({ path: filePath, bytes: buffer.byteLength }, 201);
}

// ── GET /api/recordings/:sentenceId ──────────────────────────────────────────

async function getRecording(sentenceId: string): Promise<Response> {
  const sentence = db.prepare("SELECT * FROM sentences WHERE id = ?").get(sentenceId) as SentenceRow | undefined;
  if (!sentence) return error("Sentence not found", 404);

  const version = db.prepare("SELECT * FROM topic_language_versions WHERE id = ?").get(sentence.version_id) as VersionRow | undefined;
  if (!version) return error("Version not found", 404);

  const found = findRecordingFile(version.topic_id, version.language_code, sentenceId);
  if (!found) return error("No recording for this sentence", 404);

  const file = Bun.file(found.path);
  const size = statSync(found.path).size;

  return new Response(file, {
    headers: {
      "Content-Type": found.mimeType,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── DELETE /api/recordings/:sentenceId ───────────────────────────────────────

function deleteRecording(sentenceId: string): Response {
  const sentence = db.prepare("SELECT * FROM sentences WHERE id = ?").get(sentenceId) as SentenceRow | undefined;
  if (!sentence) return error("Sentence not found", 404);

  const version = db.prepare("SELECT * FROM topic_language_versions WHERE id = ?").get(sentence.version_id) as VersionRow | undefined;
  if (!version) return error("Version not found", 404);

  const found = findRecordingFile(version.topic_id, version.language_code, sentenceId);
  if (!found) return error("No recording for this sentence", 404);

  unlinkSync(found.path);
  return new Response(null, { status: 204 });
}

// ── DELETE /api/recordings (all) ─────────────────────────────────────────────

function deleteAllRecordings(): Response {
  let deletedFiles = 0;
  let bytesFreed = 0;

  if (!existsSync(RECORDINGS_DIR)) {
    return json({ deletedFiles, bytesFreed });
  }

  // Walk recordings dir: recordings/{topicId}/{langCode}/sentence-*.{webm,ogg}
  function walkAndDelete(dir: string) {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        walkAndDelete(full);
      } else if (entry.startsWith("sentence-") && (entry.endsWith(".webm") || entry.endsWith(".ogg"))) {
        try {
          bytesFreed += stat.size;
          unlinkSync(full);
          deletedFiles++;
        } catch { /* skip */ }
      }
    }
  }

  walkAndDelete(RECORDINGS_DIR);

  // Clean up empty directories
  try { rmSync(RECORDINGS_DIR, { recursive: true, force: true }); } catch { /* ok */ }

  return json({ deletedFiles, bytesFreed });
}
