import { json, error } from "../lib/response";
import { db } from "../db/client";

interface TopicRow {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  topic_id: string;
  language_code: string;
  title: string | null;
  description: string | null;
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

  // GET /api/topics
  if (method === "GET" && path === "/api/topics") return listTopics();

  // POST /api/topics
  if (method === "POST" && path === "/api/topics") return createTopic(req);

  // GET|PUT|DELETE /api/topics/:id
  const idMatch = path.match(/^\/api\/topics\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1]!;
    if (method === "GET") return getTopic(id);
    if (method === "PUT") return updateTopic(req, id);
    if (method === "DELETE") return deleteTopic(id);
  }

  return error("not found", 404);
}

// ── GET /api/topics ──────────────────────────────────────────────────────────

function listTopics(): Response {
  const rows = db.prepare(`
    SELECT t.*, COUNT(v.id) as version_count
    FROM topics t
    LEFT JOIN topic_language_versions v ON v.topic_id = t.id
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all() as Array<TopicRow & { version_count: number }>;
  return json(rows);
}

// ── POST /api/topics ─────────────────────────────────────────────────────────

async function createTopic(req: Request): Promise<Response> {
  let body: { title?: string; description?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const title = body.title?.trim();
  if (!title) return json({ error: "title is required", field: "title" }, 400);
  if (title.length > 200) return json({ error: "title must be 200 characters or fewer", field: "title" }, 400);

  const description = body.description?.trim() || null;

  db.prepare(`
    INSERT INTO topics (title, description)
    VALUES (?, ?)
  `).run(title, description);

  const created = db.prepare(
    "SELECT * FROM topics ORDER BY created_at DESC LIMIT 1"
  ).get() as TopicRow;

  return json(created, 201);
}

// ── GET /api/topics/:id ──────────────────────────────────────────────────────

function getTopic(id: string): Response {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as TopicRow | undefined;
  if (!topic) return error("Topic not found", 404);

  const versions = db.prepare(
    "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC"
  ).all(id) as VersionRow[];

  // For each version: enrich with sentences (including attempt counts) + today's progress
  const enrichedVersions = versions.map((v) => {
    const sentences = db.prepare(`
      SELECT s.*,
             COUNT(pa.id) as attempt_count,
             MAX(pa.attempted_at) as last_attempted_at
      FROM sentences s
      LEFT JOIN practice_attempts pa ON pa.sentence_id = s.id
      WHERE s.version_id = ?
      GROUP BY s.id
      ORDER BY s.position ASC
    `).all(v.id) as Array<SentenceRow & { attempt_count: number; last_attempted_at: string | null }>;

    const totalSentences = sentences.length;

    const { practiced_today } = db.prepare(`
      SELECT COUNT(DISTINCT pa.sentence_id) as practiced_today
      FROM practice_attempts pa
      JOIN sentences s ON s.id = pa.sentence_id
      WHERE s.version_id = ? AND DATE(pa.attempted_at) = DATE('now')
    `).get(v.id) as { practiced_today: number };

    const progressToday = totalSentences > 0
      ? Math.round((practiced_today / totalSentences) * 100)
      : 0;

    return {
      ...v,
      sentences: sentences.map((s) => ({ ...s, notes: s.notes ? JSON.parse(s.notes) as Record<string, string> : null })),
      totalSentences,
      practicedToday: practiced_today,
      progressToday,
    };
  });

  return json({ ...topic, versions: enrichedVersions });
}

// ── PUT /api/topics/:id ──────────────────────────────────────────────────────

async function updateTopic(req: Request, id: string): Promise<Response> {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as TopicRow | undefined;
  if (!topic) return error("Topic not found", 404);

  let body: { title?: string; description?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const title = body.title !== undefined ? body.title.trim() : topic.title;
  if (body.title !== undefined && !title) return json({ error: "title cannot be empty", field: "title" }, 400);
  if (title.length > 200) return json({ error: "title must be 200 characters or fewer", field: "title" }, 400);

  const description = body.description !== undefined
    ? (body.description.trim() || null)
    : topic.description;

  db.prepare(`
    UPDATE topics
    SET title = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(title, description, id);

  const updated = db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as TopicRow;
  return json(updated);
}

// ── DELETE /api/topics/:id ───────────────────────────────────────────────────

function deleteTopic(id: string): Response {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(id) as TopicRow | undefined;
  if (!topic) return error("Topic not found", 404);

  db.prepare("DELETE FROM topics WHERE id = ?").run(id);
  return json({ deleted: true });
}
