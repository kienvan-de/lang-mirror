import type { IDatabase } from "../ports/db.port";
import type { TopicRow, TopicListItem, AdminTopicListItem, EnrichedTopic, EnrichedVersion, EnrichedSentence, VersionMeta, TagRow, ApprovalRequestRow, PaginatedResult } from "../db/types";
import { requireAuth, canAccess, isAdmin } from "../auth/context";
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from "../errors";
import { buildSearchPattern, buildTopicSearchClause } from "./search.utils";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

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

    // Cap tag count to prevent abuse via oversized batch inserts
    if (tagIds.length > 50) throw new ValidationError("Cannot assign more than 50 tags to a topic", "tagIds");

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

  async list(opts?: { page?: number; limit?: number; q?: string }): Promise<PaginatedResult<TopicListItem>> {
    const auth = requireAuth();
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.max(1, Math.min(opts?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
    const offset = (page - 1) * pageSize;

    // ── Optional title search (matches base title + all version titles) ────
    const searchPattern = buildSearchPattern(opts?.q ?? "");

    // ── Count total visible topics ──────────────────────────────────────────
    const countParams: unknown[] = [];
    let countSql: string;

    if (isAdmin()) {
      countSql = "SELECT COUNT(*) as total FROM topics";
      if (searchPattern) {
        const s = buildTopicSearchClause(searchPattern, "");
        countSql += ` WHERE ${s.clause}`;
        countParams.push(...s.params);
      }
    } else {
      countSql = "SELECT COUNT(*) as total FROM topics WHERE (owner_id = ? OR status = 'published')";
      countParams.push(auth.id);
      if (searchPattern) {
        const s = buildTopicSearchClause(searchPattern, "");
        countSql += ` AND ${s.clause}`;
        countParams.push(...s.params);
      }
    }

    const { total } = (await this.db.queryFirst<{ total: number }>(countSql, ...countParams))!;

    // ── Paginated topic rows — owned topics first, then by updated_at DESC ──
    const rowParams: unknown[] = [];
    let rowSql: string;

    if (isAdmin()) {
      rowSql = `
        SELECT t.*, COUNT(v.id) as version_count
        FROM topics t
        LEFT JOIN topic_language_versions v ON v.topic_id = t.id`;
      if (searchPattern) {
        const s = buildTopicSearchClause(searchPattern, "t.");
        rowSql += ` WHERE ${s.clause}`;
        rowParams.push(...s.params);
      }
      rowSql += `
        GROUP BY t.id
        ORDER BY (t.owner_id = ?) DESC, t.updated_at DESC
        LIMIT ? OFFSET ?`;
      rowParams.push(auth.id, pageSize, offset);
    } else {
      rowSql = `
        SELECT t.*, COUNT(v.id) as version_count
        FROM topics t
        LEFT JOIN topic_language_versions v ON v.topic_id = t.id
        WHERE (t.owner_id = ? OR t.status = 'published')`;
      rowParams.push(auth.id);
      if (searchPattern) {
        const s = buildTopicSearchClause(searchPattern, "t.");
        rowSql += ` AND ${s.clause}`;
        rowParams.push(...s.params);
      }
      rowSql += `
        GROUP BY t.id
        ORDER BY (t.owner_id = ?) DESC, t.updated_at DESC
        LIMIT ? OFFSET ?`;
      rowParams.push(auth.id, pageSize, offset);
    }

    const topicRows = await this.db.queryAll<TopicRow & { version_count: number }>(rowSql, ...rowParams);

    if (topicRows.length === 0) {
      return { items: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    // ── Load version meta + tags only for the topics on this page ───────────
    const topicIds = topicRows.map(t => t.id);
    const placeholders = topicIds.map(() => "?").join(",");

    const versionMeta = await this.db.queryAll<VersionMeta>(
      `SELECT id, topic_id, language_code, title, description, position
       FROM topic_language_versions
       WHERE topic_id IN (${placeholders})
       ORDER BY topic_id, position ASC`,
      ...topicIds,
    );

    const byTopic = new Map<string, VersionMeta[]>();
    for (const v of versionMeta) {
      if (!byTopic.has(v.topic_id)) byTopic.set(v.topic_id, []);
      byTopic.get(v.topic_id)!.push(v);
    }

    const allTopicTags = await this.db.queryAll<{ topic_id: string } & TagRow>(
      `SELECT tt.topic_id, t.* FROM tags t
       JOIN topic_tags tt ON tt.tag_id = t.id
       WHERE tt.topic_id IN (${placeholders})
       ORDER BY t.type ASC, t.name ASC`,
      ...topicIds,
    );
    const tagsByTopic = new Map<string, TagRow[]>();
    for (const tt of allTopicTags) {
      const { topic_id, ...tag } = tt;
      if (!tagsByTopic.has(topic_id)) tagsByTopic.set(topic_id, []);
      tagsByTopic.get(topic_id)!.push(tag as TagRow);
    }

    const items = topicRows.map(t => ({
      ...t,
      versions: byTopic.get(t.id) ?? [],
      tags: tagsByTopic.get(t.id) ?? [],
    }));

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async create(title: string, description?: string, tagIds?: string[]): Promise<TopicRow> {
    const auth = requireAuth();
    const t = title.trim();
    if (!t) throw new ValidationError("title is required", "title");
    if (t.length > 200) throw new ValidationError("title must be 200 characters or fewer", "title");

    const topicId = crypto.randomUUID();
    await this.db.run(
      "INSERT INTO topics (id, owner_id, title, description) VALUES (?, ?, ?, ?)",
      topicId, auth.id, t, description?.trim() ?? null
    );

    const topic = (await this.db.queryFirst<TopicRow>(
      "SELECT * FROM topics WHERE id = ?", topicId
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
    if (!canAccess(topic.owner_id) && !isAdmin() && topic.status !== 'published') {
      throw new NotFoundError(`Topic '${id}' not found`);
    }

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

  /** Owner submits topic for admin review */
  async submitForReview(topicId: string, note?: string): Promise<ApprovalRequestRow> {
    const auth = requireAuth();
    const topic = await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", topicId);
    if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);
    if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this topic");
    if (topic.status === "published") throw new ValidationError("Topic is already published", "status");
    if (topic.status === "pending") throw new ConflictError("Topic already has a pending review request");

    // Cancel any previous rejected/withdrawn requests for this topic by this user
    await this.db.run(
      `UPDATE topic_approval_requests SET status = 'withdrawn',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE topic_id = ? AND owner_id = ? AND status IN ('rejected', 'withdrawn')`,
      topicId, auth.id
    );

    await this.db.run(
      `INSERT INTO topic_approval_requests (id, topic_id, owner_id, note)
       VALUES (?, ?, ?, ?)`,
      crypto.randomUUID(), topicId, auth.id, note?.trim() || null
    );
    await this.db.run(
      `UPDATE topics SET status = 'pending',
       status_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       status_updated_by = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, topicId
    );
    return (await this.db.queryFirst<ApprovalRequestRow>(
      "SELECT * FROM topic_approval_requests WHERE topic_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 1",
      topicId, auth.id
    ))!;
  }

  /** Owner withdraws a pending review request */
  async withdrawRequest(topicId: string): Promise<void> {
    const auth = requireAuth();
    const topic = await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", topicId);
    if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);
    if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this topic");
    if (topic.status !== "pending") throw new ValidationError("No pending review request to withdraw", "status");

    await this.db.run(
      `UPDATE topic_approval_requests SET status = 'withdrawn',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE topic_id = ? AND owner_id = ? AND status = 'pending'`,
      topicId, auth.id
    );
    await this.db.run(
      `UPDATE topics SET status = 'private',
       status_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       status_updated_by = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      auth.id, topicId
    );
  }

  /** Admin directly unpublishes a published topic (e.g. content violation) */
  async unpublish(topicId: string): Promise<TopicRow> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can unpublish topics");
    const topic = await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", topicId);
    if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);
    if (topic.status !== "published") throw new ValidationError("Topic is not published", "status");
    const auth = requireAuth();
    await this.db.run(
      `UPDATE topics SET status = 'private', status_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       status_updated_by = ?, rejection_note = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      auth.id, topicId
    );
    return (await this.db.queryFirst<TopicRow>("SELECT * FROM topics WHERE id = ?", topicId))!;
  }

  /** Return distinct language codes across the current user's visible topics. */
  async listLanguagesInUse(): Promise<string[]> {
    const auth = requireAuth();

    const rows = isAdmin()
      ? await this.db.queryAll<{ language_code: string }>(`
          SELECT DISTINCT v.language_code
          FROM topic_language_versions v
          ORDER BY v.language_code ASC
        `)
      : await this.db.queryAll<{ language_code: string }>(`
          SELECT DISTINCT v.language_code
          FROM topic_language_versions v
          JOIN topics t ON t.id = v.topic_id
          WHERE t.owner_id = ? OR t.status = 'published'
          ORDER BY v.language_code ASC
        `, auth.id);

    return rows.map(r => r.language_code);
  }

  async adminList(): Promise<AdminTopicListItem[]> {
    if (!isAdmin()) throw new ForbiddenError("Only admins can list all topics");

    const topicRows = await this.db.queryAll<TopicRow & {
      version_count: number;
      sentence_count: number;
      owner_name: string | null;
      owner_email: string | null;
      latest_request_id: string | null;
      latest_request_status: string | null;
      latest_request_note: string | null;
    }>(`
      SELECT t.*,
             COUNT(DISTINCT v.id) as version_count,
             COUNT(DISTINCT s.id) as sentence_count,
             u.name  as owner_name,
             u.email as owner_email,
             (SELECT ar.id FROM topic_approval_requests ar
              WHERE ar.topic_id = t.id ORDER BY ar.created_at DESC LIMIT 1) as latest_request_id,
             (SELECT ar.status FROM topic_approval_requests ar
              WHERE ar.topic_id = t.id ORDER BY ar.created_at DESC LIMIT 1) as latest_request_status,
             (SELECT ar.note FROM topic_approval_requests ar
              WHERE ar.topic_id = t.id ORDER BY ar.created_at DESC LIMIT 1) as latest_request_note
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
