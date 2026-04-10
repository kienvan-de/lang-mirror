import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage } from "../ports/storage.port";
import type { VersionRow, SentenceRow, SentenceWithNotes, TopicRow } from "../db/types";
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from "../errors";
import { requireAuth, canAccess } from "../auth/context";

async function assertTopicAccess(db: IDatabase, topicId: string): Promise<void> {
  const topic = await db.queryFirst<TopicRow>("SELECT owner_id FROM topics WHERE id = ?", topicId);
  if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);
  requireAuth();
  if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this topic");
}

function parseNotes(row: SentenceRow): SentenceWithNotes {
  return { ...row, notes: row.notes ? JSON.parse(row.notes) as Record<string, string> : null };
}

export class VersionsService {
  constructor(
    private db: IDatabase,
    private storage: IObjectStorage,
  ) {}

  async listByTopic(topicId: string): Promise<VersionRow[]> {
    return this.db.queryAll<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC",
      topicId
    );
  }

  async create(topicId: string, data: {
    language_code: string;
    title?: string;
    description?: string;
    voice_name?: string;
    speed?: number;
    pitch?: number;
  }): Promise<VersionRow> {
    await assertTopicAccess(this.db, topicId);

    const lang = data.language_code?.trim();
    if (!lang) throw new ValidationError("language_code is required", "language_code");
    if (!/^[a-z]{2,3}(-[A-Z]{2,4})?$/.test(lang)) {
      throw new ValidationError("language_code must be a valid BCP-47 code (e.g. ja, fr-FR)", "language_code");
    }

    const existing = await this.db.queryFirst(
      "SELECT id FROM topic_language_versions WHERE topic_id = ? AND language_code = ?",
      topicId, lang
    );
    if (existing) throw new ConflictError(`Language '${lang}' already exists for this topic`);

    const maxPos = await this.db.queryFirst<{ m: number }>(
      "SELECT MAX(position) as m FROM topic_language_versions WHERE topic_id = ?", topicId
    );
    const position = (maxPos?.m ?? -1) + 1;

    await this.db.run(
      `INSERT INTO topic_language_versions
       (topic_id, language_code, title, description, voice_name, speed, pitch, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      topicId, lang,
      data.title?.trim() ?? null,
      data.description?.trim() ?? null,
      data.voice_name ?? null,
      data.speed ?? null,
      data.pitch ?? null,
      position
    );

    return (await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE topic_id = ? AND language_code = ?",
      topicId, lang
    ))!;
  }

  async get(id: string): Promise<VersionRow & { sentences: SentenceWithNotes[] }> {
    const version = await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", id
    );
    if (!version) throw new NotFoundError(`Version '${id}' not found`);

    const sentences = await this.db.queryAll<SentenceRow>(
      "SELECT * FROM sentences WHERE version_id = ? ORDER BY position ASC", id
    );

    return { ...version, sentences: sentences.map(parseNotes) };
  }

  async update(id: string, data: {
    title?: string | null;
    description?: string | null;
    voice_name?: string | null;
    speed?: number | null;
    pitch?: number | null;
  }): Promise<VersionRow> {
    const version = await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", id
    );
    if (!version) throw new NotFoundError(`Version '${id}' not found`);
    await assertTopicAccess(this.db, version.topic_id);

    await this.db.run(
      `UPDATE topic_language_versions
       SET title = ?, description = ?, voice_name = ?, speed = ?, pitch = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      data.title !== undefined ? (data.title?.trim() ?? null) : version.title,
      data.description !== undefined ? (data.description?.trim() ?? null) : version.description,
      data.voice_name !== undefined ? data.voice_name : version.voice_name,
      data.speed !== undefined ? data.speed : version.speed,
      data.pitch !== undefined ? data.pitch : version.pitch,
      id
    );

    return (await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", id
    ))!;
  }

  async delete(id: string): Promise<void> {
    const version = await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", id
    );
    if (!version) throw new NotFoundError(`Version '${id}' not found`);
    await assertTopicAccess(this.db, version.topic_id);

    // Delete all recordings for this version across all users
    // key format: recordings/{userId}/{topicId}/{langCode}/sentence-{id}.ext
    const allObjects = await this.storage.list("recordings/");
    const versionInfix = `${version.topic_id}/${version.language_code}/`;
    for (const obj of allObjects) {
      if (obj.key.includes(versionInfix)) {
        await this.storage.delete(obj.key);
      }
    }

    await this.db.run("DELETE FROM topic_language_versions WHERE id = ?", id);
  }

  async reorder(topicId: string, ids: string[]): Promise<VersionRow[]> {
    await assertTopicAccess(this.db, topicId);

    const existing = await this.db.queryAll<{ id: string }>(
      "SELECT id FROM topic_language_versions WHERE topic_id = ?", topicId
    );
    const existingIds = new Set(existing.map(v => v.id));
    for (const id of ids) {
      if (!existingIds.has(id)) throw new ValidationError(`Version '${id}' does not belong to this topic`);
    }

    await this.db.batch(ids.map((id, idx) => ({
      sql: "UPDATE topic_language_versions SET position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      params: [idx, id],
    })));

    return this.db.queryAll<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC", topicId
    );
  }

  async listSentences(versionId: string): Promise<SentenceWithNotes[]> {
    const version = await this.db.queryFirst(
      "SELECT id FROM topic_language_versions WHERE id = ?", versionId
    );
    if (!version) throw new NotFoundError(`Version '${versionId}' not found`);

    const rows = await this.db.queryAll<SentenceRow>(
      "SELECT * FROM sentences WHERE version_id = ? ORDER BY position ASC", versionId
    );
    return rows.map(parseNotes);
  }

  async createSentence(versionId: string, data: {
    text: string;
    notes?: Record<string, string>;
    position?: number;
  }): Promise<SentenceWithNotes> {
    const version = await this.db.queryFirst(
      "SELECT id FROM topic_language_versions WHERE id = ?", versionId
    );
    if (!version) throw new NotFoundError(`Version '${versionId}' not found`);

    const text = data.text?.trim();
    if (!text) throw new ValidationError("text is required", "text");

    if (data.position !== undefined) {
      await this.db.run(
        "UPDATE sentences SET position = position + 1 WHERE version_id = ? AND position >= ?",
        versionId, data.position
      );
    }

    const maxPos = await this.db.queryFirst<{ m: number }>(
      "SELECT MAX(position) as m FROM sentences WHERE version_id = ?", versionId
    );
    const position = data.position !== undefined ? data.position : (maxPos?.m ?? -1) + 1;

    await this.db.run(
      "INSERT INTO sentences (version_id, text, notes, position) VALUES (?, ?, ?, ?)",
      versionId, text,
      data.notes ? JSON.stringify(data.notes) : null,
      position
    );

    const created = await this.db.queryFirst<SentenceRow>(
      "SELECT * FROM sentences WHERE version_id = ? ORDER BY created_at DESC LIMIT 1", versionId
    );
    return parseNotes(created!);
  }

  async reorderSentences(versionId: string, ids: string[]): Promise<SentenceWithNotes[]> {
    const existing = await this.db.queryAll<{ id: string }>(
      "SELECT id FROM sentences WHERE version_id = ?", versionId
    );
    const existingIds = new Set(existing.map(s => s.id));
    for (const id of ids) {
      if (!existingIds.has(id)) throw new ValidationError(`Sentence '${id}' does not belong to this version`);
    }

    await this.db.batch(ids.map((id, idx) => ({
      sql: "UPDATE sentences SET position = ? WHERE id = ?",
      params: [idx, id],
    })));

    const rows = await this.db.queryAll<SentenceRow>(
      "SELECT * FROM sentences WHERE version_id = ? ORDER BY position ASC", versionId
    );
    return rows.map(parseNotes);
  }
}
