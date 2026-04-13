import type { IDatabase } from "../ports/db.port";
import type { TopicRow, TopicListItem, AdminTopicListItem, EnrichedTopic, EnrichedVersion, EnrichedSentence, VersionMeta, TagRow } from "../db/types";
import { requireAuth, canAccess, isAdmin } from "../auth/context";
import { NotFoundError, ValidationError, ForbiddenError } from "../errors";

export class TopicsService {
  constructor(private db: IDatabase) {}

  private async loadTags(topicId: string): Promise<TagRow[]> {
    return this.db.queryAll<TagRow>(`
      SELECT t.* FROM tags t
      JOIN topic_tags tt ON tt.tag_id = t.id
      WHERE tt.topic_id = ?
      ORDER BY t.type ASC, t.name ASC
    `, topicId);
  }

  async setTags(topicId: string, tagIds: string[]): Promise<TagRow[]> {
    const topic = await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", topicId);
    if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);
    requireAuth();
    if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this topic");

    // Replace all tags
    await this.db.run("DELETE FROM topic_tags WHERE topic_id = ?", topicId);
    if (tagIds.length > 0) {
      await this.db.batch(tagIds.map(tagId => ({
        sql: "INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)",
        params: [topicId, tagId],
      })));
    }
    return this.loadTags(topicId);
  }

  async list(): Promise<TopicListItem[]> {
    const auth = requireAuth();

    // Admin sees all topics; regular users see only their own + published topics
    const topicRows = isAdmin()
      ? await this.db.queryAll<TopicRow & { version_count: number }>(`
          SELECT t.*, COUNT(v.id) as version_count
          FROM topics t
          LEFT JOIN topic_language_versions v ON v.topic_id = t.id
          GROUP BY t.id ORDER BY t.updated_at DESC
        `)
      : await this.db.queryAll<TopicRow & { version_count: number }>(`
          SELECT t.*, COUNT(v.id) as version_count
          FROM topics t
          LEFT JOIN topic_language_versions v ON v.topic_id = t.id
          WHERE t.owner_id = ? OR t.published = 1
          GROUP BY t.id ORDER BY t.updated_at DESC
        `, auth.id);

    const versionMeta = await this.db.queryAll<VersionMeta>(`
      SELECT id, topic_id, language_code, title, description, position
      FROM topic_language_versions ORDER BY topic_id, position ASC
    `);

    const byTopic = new Map<string, VersionMeta[]>();
    for (const v of versionMeta) {
      if (!byTopic.has(v.topic_id)) byTopic.set(v.topic_id, []);
      byTopic.get(v.topic_id)!.push(v);
    }

    const allTopicTags = await this.db.queryAll<{ topic_id: string } & TagRow>(`
      SELECT tt.topic_id, t.* FROM tags t
      JOIN topic_tags tt ON tt.tag_id = t.id
      ORDER BY t.type ASC, t.name ASC
    `);
    const tagsByTopic = new Map<string, TagRow[]>();
    for (const tt of allTopicTags) {
      const { topic_id, ...tag } = tt;
      if (!tagsByTopic.has(topic_id)) tagsByTopic.set(topic_id, []);
      tagsByTopic.get(topic_id)!.push(tag as TagRow);
    }

    return topicRows.map(t => ({ ...t, versions: byTopic.get(t.id) ?? [], tags: tagsByTopic.get(t.id) ?? [] }));
  }

  async create(title: string, description?: string, tagIds?: string[]): Promise<TopicRow> {
    const auth = requireAuth();
    const t = title.trim();
    if (!t) throw new ValidationError("title is required", "title");
    if (t.length > 200) throw new ValidationError("title must be 200 characters or fewer", "title");

    await this.db.run(
      "INSERT INTO topics (owner_id, title, description) VALUES (?, ?, ?)",
      auth.id, t, description?.trim() ?? null
    );

    const topic = (await this.db.queryFirst<TopicRow>(
      "SELECT * FROM topics WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1", auth.id
    ))!;

    if (tagIds && tagIds.length > 0) {
      await this.setTags(topic.id, tagIds);
    }

    return topic;
  }

  async get(id: string): Promise<EnrichedTopic> {
    const auth = requireAuth();

    const topic = await this.db.queryFirst<TopicRow>(
      "SELECT * FROM topics WHERE id = ?", id
    );
    if (!topic) throw new NotFoundError(`Topic '${id}' not found`);

    const versions = await this.db.queryAll<import("../db/types").VersionRow>(
      "SELECT * FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC", id
    );

    const enrichedVersions: EnrichedVersion[] = await Promise.all(
      versions.map(async v => {
        const sentences = await this.db.queryAll<EnrichedSentence & { notes: string | null }>(`
          SELECT s.*,
                 COUNT(pa.id) as attempt_count,
                 MAX(pa.attempted_at) as last_attempted_at
          FROM sentences s
          LEFT JOIN practice_attempts pa
            ON pa.sentence_id = s.id AND pa.owner_id = ?
          WHERE s.version_id = ?
          GROUP BY s.id ORDER BY s.position ASC
        `, auth.id, v.id);

        const practicedRow = await this.db.queryFirst<{ practiced_today: number }>(`
          SELECT COUNT(DISTINCT pa.sentence_id) as practiced_today
          FROM practice_attempts pa
          JOIN sentences s ON s.id = pa.sentence_id
          WHERE s.version_id = ?
            AND pa.owner_id = ?
            AND DATE(pa.attempted_at) = DATE('now')
        `, v.id, auth.id);

        const practicedToday = practicedRow?.practiced_today ?? 0;
        const totalSentences = sentences.length;

        return {
          ...v,
          sentences: sentences.map(s => ({
            ...s,
            notes: s.notes ? JSON.parse(s.notes) as Record<string, string> : null,
          })),
          totalSentences,
          practicedToday,
          progressToday: totalSentences > 0 ? Math.round((practicedToday / totalSentences) * 100) : 0,
        };
      })
    );

    return { ...topic, versions: enrichedVersions, tags: await this.loadTags(id) };
  }

  async update(id: string, data: { title?: string; description?: string; tagIds?: string[] }): Promise<TopicRow> {
    const topic = await this.db.queryFirst<TopicRow>(
      "SELECT * FROM topics WHERE id = ?", id
    );
    if (!topic) throw new NotFoundError(`Topic '${id}' not found`);

    requireAuth();
    if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this topic");

    const title = data.title !== undefined ? data.title.trim() : topic.title;
    if (data.title !== undefined && !title) throw new ValidationError("title cannot be empty", "title");
    if (title.length > 200) throw new ValidationError("title must be 200 characters or fewer", "title");

    const description = data.description !== undefined
      ? (data.description.trim() || null)
      : topic.description;

    await this.db.run(
      `UPDATE topics SET title = ?, description = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      title, description, id
    );

    if (data.tagIds !== undefined) {
      await this.setTags(id, data.tagIds);
    }

    return (await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", id))!;
  }

  async delete(id: string): Promise<void> {
    const topic = await this.db.queryFirst<TopicRow>(
      "SELECT * FROM topics WHERE id = ?", id
    );
    if (!topic) throw new NotFoundError(`Topic '${id}' not found`);

    requireAuth();
    if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this topic");

    await this.db.run("DELETE FROM topics WHERE id = ?", id);
  }

  async publish(id: string): Promise<TopicRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can publish topics");
    const auth = requireAuth();
    const topic = await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", id);
    if (!topic) throw new NotFoundError(`Topic '${id}' not found`);
    await this.db.run(
      `UPDATE topics SET published = 1, published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       published_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      auth.id, id
    );
    return (await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", id))!;
  }

  async unpublish(id: string): Promise<TopicRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can unpublish topics");
    const topic = await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", id);
    if (!topic) throw new NotFoundError(`Topic '${id}' not found`);
    await this.db.run(
      `UPDATE topics SET published = 0, published_at = NULL, published_by = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      id
    );
    return (await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", id))!;
  }

  async adminList(): Promise<AdminTopicListItem[]> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can list all topics");

    const topicRows = await this.db.queryAll<TopicRow & {
      version_count: number;
      sentence_count: number;
      owner_name: string | null;
      owner_email: string | null;
    }>(`
      SELECT t.*,
             COUNT(DISTINCT v.id) as version_count,
             COUNT(DISTINCT s.id) as sentence_count,
             u.name  as owner_name,
             u.email as owner_email
      FROM topics t
      LEFT JOIN topic_language_versions v ON v.topic_id = t.id
      LEFT JOIN sentences s ON s.version_id = v.id
      LEFT JOIN users u ON u.id = t.owner_id
      GROUP BY t.id ORDER BY t.updated_at DESC
    `);

    const versionMeta = await this.db.queryAll<VersionMeta>(`
      SELECT id, topic_id, language_code, title, description, position
      FROM topic_language_versions ORDER BY topic_id, position ASC
    `);
    const byTopic = new Map<string, VersionMeta[]>();
    for (const v of versionMeta) {
      if (!byTopic.has(v.topic_id)) byTopic.set(v.topic_id, []);
      byTopic.get(v.topic_id)!.push(v);
    }

    const allTopicTags = await this.db.queryAll<{ topic_id: string } & TagRow>(`
      SELECT tt.topic_id, t.* FROM tags t
      JOIN topic_tags tt ON tt.tag_id = t.id
      ORDER BY t.type ASC, t.name ASC
    `);
    const tagsByTopic = new Map<string, TagRow[]>();
    for (const tt of allTopicTags) {
      const { topic_id, ...tag } = tt;
      if (!tagsByTopic.has(topic_id)) tagsByTopic.set(topic_id, []);
      tagsByTopic.get(topic_id)!.push(tag as TagRow);
    }

    return topicRows.map(t => ({
      ...t,
      versions: byTopic.get(t.id) ?? [],
      tags: tagsByTopic.get(t.id) ?? [],
    }));
  }
}
