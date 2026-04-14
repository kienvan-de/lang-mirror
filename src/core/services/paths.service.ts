import type { IDatabase } from "../ports/db.port";
import type { PathRow, PathWithTopics, PathTopicItem, TagRow } from "../db/types";
import { requireAuth, canAccess, isAdmin } from "../auth/context";
import { NotFoundError, ForbiddenError, ValidationError } from "../errors";

export class PathsService {
  constructor(private db: IDatabase) {}

  /** Get the caller's path (with topic list + progress), creating one if it doesn't exist */
  async getOrCreate(): Promise<PathWithTopics> {
    const { id: userId } = requireAuth();

    let path = await this.db.queryFirst<PathRow>(
      "SELECT * FROM paths WHERE owner_id = ? LIMIT 1", userId
    );

    if (!path) {
      const pathId = crypto.randomUUID();
      await this.db.run(
        "INSERT INTO paths (id, owner_id, name) VALUES (?, ?, 'My Learning Path')", pathId, userId
      );
      path = (await this.db.queryFirst<PathRow>(
        "SELECT * FROM paths WHERE id = ?", pathId
      ))!;
    }

    return this.enrich(path, userId);
  }

  /** Update path name/description */
  async update(pathId: string, data: { name?: string; description?: string }): Promise<PathWithTopics> {
    const { id: userId } = requireAuth();
    const path = await this.db.queryFirst<PathRow>("SELECT * FROM paths WHERE id = ?", pathId);
    if (!path) throw new NotFoundError(`Path '${pathId}' not found`);
    if (!canAccess(path.owner_id)) throw new ForbiddenError("You do not own this path");

    const name = data.name !== undefined ? data.name.trim() : path.name;
    if (data.name !== undefined && !name) throw new ValidationError("name cannot be empty", "name");

    await this.db.run(
      `UPDATE paths SET name = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      name,
      data.description !== undefined ? (data.description.trim() || null) : path.description,
      pathId
    );

    return this.enrich(
      (await this.db.queryFirst<PathRow>("SELECT * FROM paths WHERE id = ?", pathId))!,
      userId
    );
  }

  /** Add a topic to the path */
  async addTopic(pathId: string, topicId: string): Promise<PathWithTopics> {
    const { id: userId } = requireAuth();
    const path = await this.db.queryFirst<PathRow>("SELECT * FROM paths WHERE id = ?", pathId);
    if (!path) throw new NotFoundError(`Path '${pathId}' not found`);
    if (!canAccess(path.owner_id)) throw new ForbiddenError("You do not own this path");

    const topic = await this.db.queryFirst("SELECT id FROM topics WHERE id = ?", topicId);
    if (!topic) throw new NotFoundError(`Topic '${topicId}' not found`);

    const maxPos = await this.db.queryFirst<{ m: number }>(
      "SELECT COALESCE(MAX(position), -1) as m FROM path_topics WHERE path_id = ?", pathId
    );

    await this.db.run(
      "INSERT OR IGNORE INTO path_topics (path_id, topic_id, position) VALUES (?, ?, ?)",
      pathId, topicId, (maxPos?.m ?? -1) + 1
    );

    return this.enrich(path, userId);
  }

  /** Remove a topic from the path */
  async removeTopic(pathId: string, topicId: string): Promise<PathWithTopics> {
    const { id: userId } = requireAuth();
    const path = await this.db.queryFirst<PathRow>("SELECT * FROM paths WHERE id = ?", pathId);
    if (!path) throw new NotFoundError(`Path '${pathId}' not found`);
    if (!canAccess(path.owner_id)) throw new ForbiddenError("You do not own this path");

    await this.db.run("DELETE FROM path_topics WHERE path_id = ? AND topic_id = ?", pathId, topicId);

    // Re-index positions
    const remaining = await this.db.queryAll<{ topic_id: string }>(
      "SELECT topic_id FROM path_topics WHERE path_id = ? ORDER BY position ASC", pathId
    );
    if (remaining.length > 0) {
      await this.db.batch(remaining.map((r, i) => ({
        sql: "UPDATE path_topics SET position = ? WHERE path_id = ? AND topic_id = ?",
        params: [i, pathId, r.topic_id],
      })));
    }

    return this.enrich(path, userId);
  }

  /** Reorder topics in the path */
  async reorderTopics(pathId: string, topicIds: string[]): Promise<PathWithTopics> {
    const { id: userId } = requireAuth();
    const path = await this.db.queryFirst<PathRow>("SELECT * FROM paths WHERE id = ?", pathId);
    if (!path) throw new NotFoundError(`Path '${pathId}' not found`);
    if (!canAccess(path.owner_id)) throw new ForbiddenError("You do not own this path");

    await this.db.batch(topicIds.map((topicId, i) => ({
      sql: "UPDATE path_topics SET position = ? WHERE path_id = ? AND topic_id = ?",
      params: [i, pathId, topicId],
    })));

    return this.enrich(path, userId);
  }

  /** Search other users' paths by name */
  async search(q: string): Promise<(PathRow & { topic_count: number; owner_name: string | null; owner_email: string | null })[]> {
    const { id: userId } = requireAuth();
    const query = `%${q.trim()}%`;
    return this.db.queryAll<PathRow & { topic_count: number; owner_name: string | null; owner_email: string | null }>(
      `SELECT p.*, COUNT(pt.topic_id) as topic_count,
              u.name as owner_name, u.email as owner_email
       FROM paths p
       LEFT JOIN path_topics pt ON pt.path_id = p.id
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id != ? AND p.name LIKE ?
       GROUP BY p.id
       ORDER BY p.name ASC LIMIT 20`,
      userId, query
    );
  }

  /** Copy another user's path topics into the caller's path */
  async copy(sourcePathId: string): Promise<PathWithTopics> {
    const { id: userId } = requireAuth();

    const source = await this.db.queryFirst<PathRow>(
      "SELECT * FROM paths WHERE id = ?", sourcePathId
    );
    if (!source) throw new NotFoundError(`Path '${sourcePathId}' not found`);
    if (source.owner_id === userId) throw new ValidationError("Cannot copy your own path");

    // Get or create caller's path
    let myPath = await this.db.queryFirst<PathRow>(
      "SELECT * FROM paths WHERE owner_id = ? LIMIT 1", userId
    );
    if (!myPath) {
      const newPathId = crypto.randomUUID();
      await this.db.run(
        "INSERT INTO paths (id, owner_id, name) VALUES (?, ?, ?)", newPathId, userId, source.name
      );
      myPath = (await this.db.queryFirst<PathRow>(
        "SELECT * FROM paths WHERE id = ?", newPathId
      ))!;
    }

    const sourceTopics = await this.db.queryAll<{ topic_id: string; position: number }>(
      "SELECT topic_id, position FROM path_topics WHERE path_id = ? ORDER BY position ASC", sourcePathId
    );

    const maxPos = await this.db.queryFirst<{ m: number }>(
      "SELECT COALESCE(MAX(position), -1) as m FROM path_topics WHERE path_id = ?", myPath.id
    );
    let offset = (maxPos?.m ?? -1) + 1;

    if (sourceTopics.length > 0) {
      await this.db.batch(sourceTopics.map((t) => ({
        sql: "INSERT OR IGNORE INTO path_topics (path_id, topic_id, position) VALUES (?, ?, ?)",
        params: [myPath!.id, t.topic_id, offset++],
      })));
    }

    return this.enrich(myPath, userId);
  }

  /** Enrich a path with its topics + progress for the given user */
  private async enrich(path: PathRow, userId: string): Promise<PathWithTopics> {
    const rows = await this.db.queryAll<{ topic_id: string; topic_title: string; position: number }>(
      `SELECT pt.topic_id, t.title as topic_title, pt.position
       FROM path_topics pt
       JOIN topics t ON t.id = pt.topic_id
       WHERE pt.path_id = ?
       ORDER BY pt.position ASC`,
      path.id
    );

    const topics: PathTopicItem[] = await Promise.all(rows.map(async (r) => {
      // Total unique sentences across all versions of this topic
      const totalRow = await this.db.queryFirst<{ total: number }>(
        `SELECT COUNT(*) as total FROM sentences s
         JOIN topic_language_versions v ON v.id = s.version_id
         WHERE v.topic_id = ?`,
        r.topic_id
      );

      // Unique sentences practiced at least once by this user
      const practicedRow = await this.db.queryFirst<{ practiced: number }>(
        `SELECT COUNT(DISTINCT sentence_id) as practiced
         FROM practice_attempts
         WHERE topic_id = ? AND owner_id = ?`,
        r.topic_id, userId
      );

      // Tags for this topic
      const tags = await this.db.queryAll<TagRow>(
        `SELECT tg.* FROM tags tg
         JOIN topic_tags tt ON tt.tag_id = tg.id
         WHERE tt.topic_id = ?
         ORDER BY tg.type ASC, tg.name ASC`,
        r.topic_id
      );

      // Version titles for language-aware display
      const versions = await this.db.queryAll<{ language_code: string; title: string | null }>(
        `SELECT language_code, title FROM topic_language_versions WHERE topic_id = ? ORDER BY position ASC`,
        r.topic_id
      );

      const total = totalRow?.total ?? 0;
      const practiced = practicedRow?.practiced ?? 0;

      return {
        topic_id: r.topic_id,
        topic_title: r.topic_title,
        topic_versions: versions,
        position: r.position,
        tags,
        totalSentences: total,
        practicedSentences: practiced,
        isDone: total > 0 && practiced >= total,
      };
    }));

    return { ...path, topics };
  }
}
