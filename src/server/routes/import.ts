import { json, error } from "../lib/response";
import { db } from "../db/client";
import { parseAndValidate, type LessonImportSingle, type LessonImportTopic } from "../services/import.service";

interface TopicRow { id: string; title: string; description: string | null; created_at: string; updated_at: string }
interface VersionRow { id: string; topic_id: string; language_code: string; voice_name: string | null; speed: number | null; pitch: number | null; position: number; created_at: string; updated_at: string }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // POST /api/import/preview — parse only, no DB writes
  if (method === "POST" && path === "/api/import/preview") {
    return handlePreview(req);
  }

  // POST /api/import — full import
  if (method === "POST" && path === "/api/import") {
    return handleImport(req, url);
  }

  return error("not found", 404);
}

// ── Helper: read multipart file field ────────────────────────────────────────

async function readMultipartFile(req: Request): Promise<{ content: string; filename: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let formData: any;
  try {
    formData = await req.formData();
  } catch {
    return null;
  }
  const file = formData.get("file");
  if (!file || typeof file === "string") return null;
  const filename = (file as File).name ?? "import.json";
  const content = await (file as File).text();
  return { content, filename };
}

// ── POST /api/import/preview ──────────────────────────────────────────────────

async function handlePreview(req: Request): Promise<Response> {
  const parsed = await readMultipartFile(req);
  if (!parsed) {
    return error("No file provided. Send a multipart/form-data request with a 'file' field.", 400);
  }

  const { content, filename } = parsed;
  const result = parseAndValidate(content, filename);

  if (result.parseError) {
    return json({ ok: false, parseError: result.parseError, errors: [], format: null, title: null, versions: [] });
  }

  if (result.errors.length > 0 || !result.data) {
    return json({ ok: false, parseError: null, errors: result.errors, format: null, title: null, versions: [] });
  }

  const data = result.data;
  if (data.format === "single") {
    return json({
      ok: true,
      parseError: null,
      errors: [],
      format: "single",
      title: data.title,
      description: data.description ?? null,
      versions: [{ language: data.language, sentenceCount: data.sentences.length }],
    });
  } else {
    return json({
      ok: true,
      parseError: null,
      errors: [],
      format: "topic",
      title: data.title,
      description: data.description ?? null,
      versions: data.versions.map((v) => ({ language: v.language, sentenceCount: v.sentences.length })),
    });
  }
}

// ── POST /api/import ──────────────────────────────────────────────────────────

async function handleImport(req: Request, url: URL): Promise<Response> {
  const onDuplicate = (url.searchParams.get("onDuplicate") as "skip" | "error") ?? "error";

  const parsed = await readMultipartFile(req);
  if (!parsed) {
    return error("No file provided. Send a multipart/form-data request with a 'file' field.", 400);
  }

  const { content, filename } = parsed;
  const result = parseAndValidate(content, filename);

  if (result.parseError) {
    return error(result.parseError, 400);
  }
  if (result.errors.length > 0 || !result.data) {
    return json({ error: "Validation failed", details: result.errors }, 400);
  }

  // Optional: attach to existing topic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let topicFormData: any;
  try { topicFormData = await req.clone().formData(); } catch { topicFormData = null; }
  const existingTopicId = topicFormData ? (topicFormData.get("topic_id") as string | null) : null;

  // Validate existing topic if provided
  if (existingTopicId) {
    const existing = db.prepare("SELECT id FROM topics WHERE id = ?").get(existingTopicId) as { id: string } | undefined;
    if (!existing) return error(`Topic '${existingTopicId}' not found`, 404);
  }

  const data = result.data;

  if (data.format === "single") {
    return importSingle(data, existingTopicId, onDuplicate);
  } else {
    return importTopic(data, existingTopicId, onDuplicate);
  }
}

// ── Import single-language format ─────────────────────────────────────────────

function importSingle(
  data: LessonImportSingle,
  existingTopicId: string | null,
  onDuplicate: "skip" | "error"
): Response {
  const doImport = db.transaction(() => {
    let topicId: string;

    if (existingTopicId) {
      topicId = existingTopicId;
    } else {
      // Create new topic
      db.prepare(`
        INSERT INTO topics (title, description)
        VALUES (?, ?)
      `).run(data.title, data.description ?? null);
      const row = db.prepare(
        "SELECT id FROM topics WHERE title = ? ORDER BY created_at DESC LIMIT 1"
      ).get(data.title) as { id: string };
      topicId = row.id;
    }

    // Check if language already exists
    const existingVersion = db.prepare(
      "SELECT id FROM topic_language_versions WHERE topic_id = ? AND language_code = ?"
    ).get(topicId, data.language) as { id: string } | undefined;

    if (existingVersion) {
      if (onDuplicate === "skip") {
        const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as TopicRow;
        return { skipped: true, topic, versions: [], totalSentences: 0 };
      }
      throw Object.assign(new Error(`Language '${data.language}' already exists on this topic`), { status: 409 });
    }

    // Get max position
    const maxPos = (db.prepare(
      "SELECT COALESCE(MAX(position), -1) as m FROM topic_language_versions WHERE topic_id = ?"
    ).get(topicId) as { m: number }).m;

    // Create version
    db.prepare(`
      INSERT INTO topic_language_versions (topic_id, language_code, voice_name, speed, pitch, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(topicId, data.language, data.voice_name ?? null, data.speed ?? null, data.pitch ?? null, maxPos + 1);

    const version = db.prepare(
      "SELECT * FROM topic_language_versions WHERE topic_id = ? AND language_code = ?"
    ).get(topicId, data.language) as VersionRow;

    // Insert sentences
    const insertSentence = db.prepare(`
      INSERT INTO sentences (version_id, text, translation, notes, position)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < data.sentences.length; i++) {
      const s = data.sentences[i]!;
      insertSentence.run(version.id, s.text, s.translation ?? null, s.notes ?? null, i);
    }

    const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as TopicRow;
    return {
      skipped: false,
      topic,
      versions: [{ version, sentenceCount: data.sentences.length }],
      totalSentences: data.sentences.length,
    };
  });

  try {
    const result = doImport();
    if (result.skipped) {
      return json({ topic: result.topic, versions: [], totalSentences: 0, skipped: true });
    }
    return json({
      topic: result.topic,
      versions: result.versions,
      totalSentences: result.totalSentences,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(err.message, err.status ?? 500);
  }
}

// ── Import multi-language topic format ────────────────────────────────────────

function importTopic(
  data: LessonImportTopic,
  existingTopicId: string | null,
  onDuplicate: "skip" | "error"
): Response {
  const doImport = db.transaction(() => {
    let topicId: string;

    if (existingTopicId) {
      topicId = existingTopicId;
    } else {
      db.prepare(`
        INSERT INTO topics (title, description)
        VALUES (?, ?)
      `).run(data.title, data.description ?? null);
      const row = db.prepare(
        "SELECT id FROM topics WHERE title = ? ORDER BY created_at DESC LIMIT 1"
      ).get(data.title) as { id: string };
      topicId = row.id;
    }

    // Get current max position
    const maxPosRow = db.prepare(
      "SELECT COALESCE(MAX(position), -1) as m FROM topic_language_versions WHERE topic_id = ?"
    ).get(topicId) as { m: number };
    let posOffset = maxPosRow.m + 1;

    const versionsResult: Array<{ version: VersionRow; sentenceCount: number }> = [];
    let totalSentences = 0;

    for (const v of data.versions) {
      // Check duplicate
      const existingVersion = db.prepare(
        "SELECT id FROM topic_language_versions WHERE topic_id = ? AND language_code = ?"
      ).get(topicId, v.language) as { id: string } | undefined;

      if (existingVersion) {
        if (onDuplicate === "skip") continue;
        throw Object.assign(
          new Error(`Language '${v.language}' already exists on this topic`),
          { status: 409 }
        );
      }

      db.prepare(`
        INSERT INTO topic_language_versions (topic_id, language_code, voice_name, speed, pitch, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(topicId, v.language, v.voice_name ?? null, v.speed ?? null, v.pitch ?? null, posOffset++);

      const version = db.prepare(
        "SELECT * FROM topic_language_versions WHERE topic_id = ? AND language_code = ?"
      ).get(topicId, v.language) as VersionRow;

      const insertSentence = db.prepare(`
        INSERT INTO sentences (version_id, text, translation, notes, position)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < v.sentences.length; i++) {
        const s = v.sentences[i]!;
        insertSentence.run(version.id, s.text, s.translation ?? null, s.notes ?? null, i);
      }

      versionsResult.push({ version, sentenceCount: v.sentences.length });
      totalSentences += v.sentences.length;
    }

    const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as TopicRow;
    return { topic, versions: versionsResult, totalSentences };
  });

  try {
    const result = doImport();
    return json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(err.message, err.status ?? 500);
  }
}
