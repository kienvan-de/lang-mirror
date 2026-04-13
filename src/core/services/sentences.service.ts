import type { IDatabase } from "../ports/db.port";
import type { SentenceRow, SentenceWithNotes, TopicRow } from "../db/types";
import { NotFoundError, ValidationError, ForbiddenError } from "../errors";
import { requireAuth, canAccess } from "../auth/context";

async function assertSentenceAccess(db: IDatabase, sentenceId: string): Promise<void> {
  const row = await db.queryFirst<{ owner_id: string }>(`
    SELECT t.owner_id FROM sentences s
    JOIN topic_language_versions v ON v.id = s.version_id
    JOIN topics t ON t.id = v.topic_id
    WHERE s.id = ?
  `, sentenceId);
  if (!row) throw new NotFoundError(`Sentence '${sentenceId}' not found`);
  requireAuth();
  if (!canAccess(row.owner_id)) throw new ForbiddenError("You do not own this topic");
}

function parseNotes(row: SentenceRow): SentenceWithNotes {
  return { ...row, notes: row.notes ? JSON.parse(row.notes) as Record<string, string> : null };
}

export class SentencesService {
  constructor(private db: IDatabase) {}

  async update(id: string, data: {
    text?: string;
    notes?: Record<string, string>;
  }): Promise<SentenceWithNotes> {
    await assertSentenceAccess(this.db, id);
    const current = await this.db.queryFirst<SentenceRow>(
      "SELECT * FROM sentences WHERE id = ?", id
    );
    if (!current) throw new NotFoundError(`Sentence '${id}' not found`);

    const newText = data.text !== undefined ? data.text.trim() : current.text;
    if (data.text !== undefined && !newText) throw new ValidationError("text cannot be empty", "text");

    await this.db.run(
      `UPDATE sentences
       SET text = ?, notes = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      newText,
      data.notes !== undefined ? JSON.stringify(data.notes) : current.notes,
      id
    );

    const updated = await this.db.queryFirst<SentenceRow>(
      "SELECT * FROM sentences WHERE id = ?", id
    );
    return parseNotes(updated!);
  }

  async delete(id: string): Promise<void> {
    await assertSentenceAccess(this.db, id);
    const sentence = await this.db.queryFirst<SentenceRow>(
      "SELECT * FROM sentences WHERE id = ?", id
    );
    if (!sentence) throw new NotFoundError(`Sentence '${id}' not found`);

    await this.db.run("DELETE FROM sentences WHERE id = ?", id);

    // Re-index remaining positions (0-based sequential)
    const remaining = await this.db.queryAll<{ id: string }>(
      "SELECT id FROM sentences WHERE version_id = ? ORDER BY position ASC",
      sentence.version_id
    );

    if (remaining.length > 0) {
      await this.db.batch(remaining.map((s, idx) => ({
        sql: "UPDATE sentences SET position = ? WHERE id = ?",
        params: [idx, s.id],
      })));
    }
  }
}
