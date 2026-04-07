import { json, error } from "../lib/response";
import { db } from "../db/client";
import { deleteCacheFile } from "../services/tts.service";

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

  // PUT /api/sentences/:id
  const editMatch = path.match(/^\/api\/sentences\/([^/]+)$/);
  if (editMatch && method === "PUT") {
    return handleUpdateSentence(req, editMatch[1]!);
  }

  // DELETE /api/sentences/:id
  if (editMatch && method === "DELETE") {
    return handleDeleteSentence(editMatch[1]!);
  }

  return error("not found", 404);
}

// ── PUT /api/sentences/:id ──────────────────────────────────────────────────

async function handleUpdateSentence(req: Request, id: string): Promise<Response> {
  const current = db
    .prepare("SELECT * FROM sentences WHERE id = ?")
    .get(id) as SentenceRow | undefined;

  if (!current) return error("Sentence not found", 404);

  let body: { text?: string; notes?: string; position?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return error("Invalid JSON body", 400);
  }

  const newText = body.text !== undefined ? body.text.trim() : current.text;
  if (body.text !== undefined && !newText) return error("text cannot be empty", 400);

  // US-3.6: If text changed, invalidate TTS cache
  let newCacheKey = current.tts_cache_key;
  if (body.text !== undefined && body.text.trim() !== current.text) {
    if (current.tts_cache_key) {
      deleteCacheFile(current.tts_cache_key);
    }
    newCacheKey = null;
  }

  db.prepare(`
    UPDATE sentences
    SET text = ?, notes = ?, tts_cache_key = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(
    newText,
    body.notes !== undefined ? body.notes : current.notes,
    newCacheKey,
    id
  );

  const updated = db.prepare("SELECT * FROM sentences WHERE id = ?").get(id) as SentenceRow;
  return json(updated);
}

// ── DELETE /api/sentences/:id ───────────────────────────────────────────────

function handleDeleteSentence(id: string): Response {
  const sentence = db
    .prepare("SELECT * FROM sentences WHERE id = ?")
    .get(id) as SentenceRow | undefined;

  if (!sentence) return error("Sentence not found", 404);

  // Delete TTS cache file if present
  if (sentence.tts_cache_key) {
    deleteCacheFile(sentence.tts_cache_key);
  }

  db.prepare("DELETE FROM sentences WHERE id = ?").run(id);

  // Reindex remaining positions for this version (0-based sequential)
  const remaining = db
    .prepare("SELECT id FROM sentences WHERE version_id = ? ORDER BY position ASC")
    .all(sentence.version_id) as Array<{ id: string }>;

  const reindex = db.prepare("UPDATE sentences SET position = ? WHERE id = ?");
  const reindexAll = db.transaction(() => {
    remaining.forEach((s, idx) => reindex.run(idx, s.id));
  });
  reindexAll();

  return json({ deleted: true });
}
