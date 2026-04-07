import { json, error } from "../lib/response";
import { db } from "../db/client";
import { RECORDINGS_DIR } from "../lib/data-dir";
import { deleteCacheFile } from "../services/tts.service";
import { join } from "path";
import { existsSync, rmSync } from "fs";

interface VersionRow {
  id: string;
  topic_id: string;
  language_code: string;
  voice_name: string | null;
  speed: number | null;
  pitch: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

interface SentenceRow {
  id: string;
  version_id: string;
  text: string;
  notes: string | null;
  position: number;
  tts_cache_key: string | null;
  created_at: string;
  updated_at: string;
}

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // GET|POST /api/topics/:topicId/versions
  const topicVersionsMatch = path.match(/^\/api\/topics\/([^/]+)\/versions$/);
  if (topicVersionsMatch) {
    const topicId = topicVersionsMatch[1]!;
    if (method === "GET") return listVersions(topicId);
    if (method === "POST") return createVersion(req, topicId);
  }

  // POST /api/topics/:topicId/versions/reorder
  const reorderVersionsMatch = path.match(/^\/api\/topics\/([^/]+)\/versions\/reorder$/);
  if (reorderVersionsMatch && method === "POST") return reorderVersions(req, reorderVersionsMatch[1]!);

  // GET|PUT|DELETE /api/versions/:id
  const versionMatch = path.match(/^\/api\/versions\/([^/]+)$/);
  if (versionMatch) {
    const id = versionMatch[1]!;
    if (method === "GET") return getVersion(id);
    if (method === "PUT") return updateVersion(req, id);
    if (method === "DELETE") return deleteVersion(id);
  }

  // POST /api/versions/:id/sentences/reorder (must come before /sentences)
  const reorderMatch = path.match(/^\/api\/versions\/([^/]+)\/sentences\/reorder$/);
  if (reorderMatch && method === "POST") return reorderSentences(req, reorderMatch[1]!);

  // GET|POST /api/versions/:id/sentences
  const sentencesMatch = path.match(/^\/api\/versions\/([^/]+)\/sentences$/);
  if (sentencesMatch) {
    const versionId = sentencesMatch[1]!;
    if (method === "GET") return listSentences(versionId);
    if (method === "POST") return createSentence(req, versionId);
  }

  return error("not found", 404);
}

// ── GET /api/topics/:topicId/versions ────────────────────────────────────────

function listVersions(topicId: string): Response {
  const rows = db.prepare(
    "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC"
  ).all(topicId) as VersionRow[];
  return json(rows);
}

// ── POST /api/topics/:topicId/versions ───────────────────────────────────────

async function createVersion(req: Request, topicId: string): Promise<Response> {
  const topic = db.prepare("SELECT id FROM topics WHERE id = ?").get(topicId);
  if (!topic) return error("Topic not found", 404);

  let body: { language_code?: string; voice_name?: string; speed?: number; pitch?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const lang = body.language_code?.trim();
  if (!lang) return json({ error: "language_code is required", field: "language_code" }, 400);
  if (!/^[a-z]{2,3}(-[A-Z]{2,4})?$/.test(lang)) {
    return json({ error: "language_code must be a valid BCP-47 code (e.g. ja, es, fr-FR)", field: "language_code" }, 400);
  }

  // Check for duplicate
  const existing = db.prepare(
    "SELECT id FROM topic_language_versions WHERE topic_id = ? AND language_code = ?"
  ).get(topicId, lang);
  if (existing) {
    return json({ error: `Language '${lang}' already exists for this topic` }, 409);
  }

  // Auto-assign next position
  const maxPos = (db.prepare(
    "SELECT MAX(position) as m FROM topic_language_versions WHERE topic_id = ?"
  ).get(topicId) as { m: number | null }).m ?? -1;

  db.prepare(`
    INSERT INTO topic_language_versions (topic_id, language_code, voice_name, speed, pitch, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(topicId, lang, body.voice_name ?? null, body.speed ?? null, body.pitch ?? null, maxPos + 1);

  const created = db.prepare(
    "SELECT * FROM topic_language_versions WHERE topic_id = ? AND language_code = ?"
  ).get(topicId, lang) as VersionRow;

  return json(created, 201);
}

// ── GET /api/versions/:id ────────────────────────────────────────────────────

function getVersion(id: string): Response {
  const version = db.prepare(
    "SELECT * FROM topic_language_versions WHERE id = ?"
  ).get(id) as VersionRow | undefined;
  if (!version) return error("Version not found", 404);

  const sentences = db.prepare(
    "SELECT * FROM sentences WHERE version_id = ? ORDER BY position ASC"
  ).all(id) as SentenceRow[];

  return json({ ...version, sentences: sentences.map(parseNotesRow) });
}

// ── PUT /api/versions/:id ────────────────────────────────────────────────────

async function updateVersion(req: Request, id: string): Promise<Response> {
  const version = db.prepare(
    "SELECT * FROM topic_language_versions WHERE id = ?"
  ).get(id) as VersionRow | undefined;
  if (!version) return error("Version not found", 404);

  let body: { voice_name?: string | null; speed?: number | null; pitch?: number | null };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  db.prepare(`
    UPDATE topic_language_versions
    SET voice_name = ?, speed = ?, pitch = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(
    body.voice_name !== undefined ? body.voice_name : version.voice_name,
    body.speed !== undefined ? body.speed : version.speed,
    body.pitch !== undefined ? body.pitch : version.pitch,
    id
  );

  const updated = db.prepare(
    "SELECT * FROM topic_language_versions WHERE id = ?"
  ).get(id) as VersionRow;
  return json(updated);
}

// ── DELETE /api/versions/:id ─────────────────────────────────────────────────

function deleteVersion(id: string): Response {
  const version = db.prepare(
    "SELECT * FROM topic_language_versions WHERE id = ?"
  ).get(id) as VersionRow | undefined;
  if (!version) return error("Version not found", 404);

  // Delete recordings directory for this version
  const recDir = join(RECORDINGS_DIR, version.topic_id, version.language_code);
  if (existsSync(recDir)) {
    rmSync(recDir, { recursive: true, force: true });
  }

  // Delete TTS cache for all sentences in this version
  const sentences = db.prepare(
    "SELECT tts_cache_key FROM sentences WHERE version_id = ? AND tts_cache_key IS NOT NULL"
  ).all(id) as Array<{ tts_cache_key: string }>;
  for (const s of sentences) {
    deleteCacheFile(s.tts_cache_key);
  }

  db.prepare("DELETE FROM topic_language_versions WHERE id = ?").run(id);
  return json({ deleted: true });
}

// ── Helper: parse notes JSON string → object ─────────────────────────────────

function parseNotesRow(row: SentenceRow): object {
  return { ...row, notes: row.notes ? JSON.parse(row.notes) as Record<string, string> : null };
}

// ── GET /api/versions/:id/sentences ──────────────────────────────────────────

function listSentences(versionId: string): Response {
  const version = db.prepare(
    "SELECT id FROM topic_language_versions WHERE id = ?"
  ).get(versionId);
  if (!version) return error("Version not found", 404);

  const rows = db.prepare(
    "SELECT * FROM sentences WHERE version_id = ? ORDER BY position ASC"
  ).all(versionId) as SentenceRow[];
  return json(rows.map(parseNotesRow));
}

// ── POST /api/versions/:id/sentences ─────────────────────────────────────────

async function createSentence(req: Request, versionId: string): Promise<Response> {
  const version = db.prepare(
    "SELECT id FROM topic_language_versions WHERE id = ?"
  ).get(versionId);
  if (!version) return error("Version not found", 404);

  let body: { text?: string; notes?: Record<string, string>; position?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const text = body.text?.trim();
  if (!text) return json({ error: "text is required", field: "text" }, 400);

  // Determine position
  let position: number;
  if (body.position !== undefined) {
    position = body.position;
    // Shift existing sentences at and after this position
    db.prepare(`
      UPDATE sentences SET position = position + 1
      WHERE version_id = ? AND position >= ?
    `).run(versionId, position);
  } else {
    const maxPos = (db.prepare(
      "SELECT MAX(position) as m FROM sentences WHERE version_id = ?"
    ).get(versionId) as { m: number | null }).m ?? -1;
    position = maxPos + 1;
  }

  db.prepare(`
    INSERT INTO sentences (version_id, text, notes, position)
    VALUES (?, ?, ?, ?)
  `).run(versionId, text, body.notes ? JSON.stringify(body.notes) : null, position);

  const created = db.prepare(
    "SELECT * FROM sentences WHERE version_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(versionId) as SentenceRow;

  return json(parseNotesRow(created), 201);
}

// ── POST /api/topics/:topicId/versions/reorder ───────────────────────────────

async function reorderVersions(req: Request, topicId: string): Promise<Response> {
  const topic = db.prepare("SELECT id FROM topics WHERE id = ?").get(topicId);
  if (!topic) return error("Topic not found", 404);

  let body: { ids?: string[] };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return error("ids must be a non-empty array", 400);
  }

  // Validate all IDs belong to this topic
  const existing = db.prepare(
    "SELECT id FROM topic_language_versions WHERE topic_id = ?"
  ).all(topicId) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((v) => v.id));

  for (const id of body.ids) {
    if (!existingIds.has(id)) {
      return error(`Version '${id}' does not belong to this topic`, 400);
    }
  }

  const update = db.prepare("UPDATE topic_language_versions SET position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?");
  const reorder = db.transaction(() => {
    body.ids!.forEach((id, idx) => update.run(idx, id));
  });
  reorder();

  const updated = db.prepare(
    "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC"
  ).all(topicId) as VersionRow[];
  return json(updated);
}

// ── POST /api/versions/:id/sentences/reorder ─────────────────────────────────

async function reorderSentences(req: Request, versionId: string): Promise<Response> {
  let body: { ids?: string[] };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return error("ids must be a non-empty array", 400);
  }

  // Validate all IDs belong to this version
  const existing = db.prepare(
    "SELECT id FROM sentences WHERE version_id = ?"
  ).all(versionId) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((s) => s.id));

  for (const id of body.ids) {
    if (!existingIds.has(id)) {
      return error(`Sentence '${id}' does not belong to this version`, 400);
    }
  }

  const update = db.prepare("UPDATE sentences SET position = ? WHERE id = ?");
  const reorder = db.transaction(() => {
    body.ids!.forEach((id, idx) => update.run(idx, id));
  });
  reorder();

  const updated = db.prepare(
    "SELECT * FROM sentences WHERE version_id = ? ORDER BY position ASC"
  ).all(versionId) as SentenceRow[];
  return json(updated.map(parseNotesRow));
}
