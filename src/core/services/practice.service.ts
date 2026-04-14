import type { IDatabase } from "../ports/db.port";
import type { PracticeAttemptRow } from "../db/types";
import { requireAuth } from "../auth/context";
import { NotFoundError, ValidationError } from "../errors";

export interface DailyStats {
  today: { attempts: number; topics: number; sentences: number };
  week: Array<{ date: string; attempts: number }>;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string | null;
}

export interface RecentItem {
  topicId: string;
  topicTitle: string;
  versionId: string;
  langCode: string;
  lastAttemptAt: string;
  sentencesAttemptedToday: number;
  totalSentences: number;
}

export class PracticeService {
  constructor(private db: IDatabase) {}

  async logAttempt(data: {
    sentence_id: string;
    version_id: string;
    topic_id: string;
  }): Promise<PracticeAttemptRow> {
    if (!data.sentence_id) throw new ValidationError("sentence_id is required");
    if (!data.version_id)  throw new ValidationError("version_id is required");
    if (!data.topic_id)    throw new ValidationError("topic_id is required");

    const auth = requireAuth();

    const sentence = await this.db.queryFirst(
      "SELECT id FROM sentences WHERE id = ?", data.sentence_id
    );
    if (!sentence) throw new NotFoundError(`Sentence '${data.sentence_id}' not found`);

    await this.db.run(
      "INSERT INTO practice_attempts (id, owner_id, sentence_id, version_id, topic_id) VALUES (?, ?, ?, ?, ?)",
      crypto.randomUUID(), auth.id, data.sentence_id, data.version_id, data.topic_id
    );

    return (await this.db.queryFirst<PracticeAttemptRow>(
      "SELECT * FROM practice_attempts WHERE sentence_id = ? AND owner_id = ? ORDER BY attempted_at DESC LIMIT 1",
      data.sentence_id, auth.id
    ))!;
  }

  async getDailyStats(): Promise<DailyStats> {
    const { id: ownerId } = requireAuth();

    const today = await this.db.queryFirst<{ attempts: number; sentences: number }>(
      `SELECT COUNT(*) as attempts, COUNT(DISTINCT sentence_id) as sentences
       FROM practice_attempts
       WHERE DATE(attempted_at) = DATE('now') AND owner_id = ?`,
      ownerId
    );
    const topicsToday = await this.db.queryFirst<{ topics: number }>(
      `SELECT COUNT(DISTINCT topic_id) as topics
       FROM practice_attempts
       WHERE DATE(attempted_at) = DATE('now') AND owner_id = ?`,
      ownerId
    );
    const week = await this.db.queryAll<{ date: string; attempts: number }>(
      `SELECT DATE(attempted_at) as date, COUNT(*) as attempts
       FROM practice_attempts
       WHERE attempted_at >= DATE('now', '-6 days') AND owner_id = ?
       GROUP BY DATE(attempted_at) ORDER BY date ASC`,
      ownerId
    );

    return {
      today: {
        attempts:  today?.attempts ?? 0,
        topics:    topicsToday?.topics ?? 0,
        sentences: today?.sentences ?? 0,
      },
      week,
    };
  }

  async getStreak(): Promise<StreakStats> {
    const { id: ownerId } = requireAuth();

    const dates = (await this.db.queryAll<{ date: string }>(
      `SELECT DISTINCT DATE(attempted_at) as date
       FROM practice_attempts WHERE owner_id = ? ORDER BY date DESC`,
      ownerId
    )).map(r => r.date);

    if (dates.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastPracticeDate: null };
    }

    const todayStr     = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const dateSet      = new Set(dates);

    let currentStreak = 0;
    const startDate = dateSet.has(todayStr) ? todayStr : dateSet.has(yesterdayStr) ? yesterdayStr : null;
    if (startDate) {
      let d = new Date(startDate + "T12:00:00Z");
      while (dateSet.has(d.toISOString().slice(0, 10))) {
        currentStreak++;
        d = new Date(d.getTime() - 86_400_000);
      }
    }

    const sortedDates = [...dates].sort();
    let longest = 1, run = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const diff = Math.round(
        (new Date(sortedDates[i]! + "T12:00:00Z").getTime() -
         new Date(sortedDates[i-1]! + "T12:00:00Z").getTime()) / 86_400_000
      );
      if (diff === 1) { run++; if (run > longest) longest = run; }
      else run = 1;
    }

    return {
      currentStreak,
      longestStreak: Math.max(longest, currentStreak),
      lastPracticeDate: dates[0] ?? null,
    };
  }

  async getRecent(): Promise<RecentItem[]> {
    const { id: ownerId } = requireAuth();

    return this.db.queryAll<RecentItem>(
      `SELECT
         pa.topic_id as topicId, t.title as topicTitle,
         pa.version_id as versionId, v.language_code as langCode,
         MAX(pa.attempted_at) as lastAttemptAt,
         (SELECT COUNT(DISTINCT pa2.sentence_id) FROM practice_attempts pa2
          WHERE pa2.version_id = pa.version_id
            AND pa2.owner_id = ?
            AND DATE(pa2.attempted_at) = DATE('now')
         ) as sentencesAttemptedToday,
         (SELECT COUNT(*) FROM sentences s WHERE s.version_id = pa.version_id) as totalSentences
       FROM practice_attempts pa
       JOIN topics t ON t.id = pa.topic_id
       JOIN topic_language_versions v ON v.id = pa.version_id
       WHERE pa.owner_id = ?
       GROUP BY pa.topic_id, pa.version_id
       ORDER BY lastAttemptAt DESC LIMIT 3`,
      ownerId, ownerId
    );
  }

  async getCalendar(weeks: number): Promise<Array<{ date: string; attempts: number }>> {
    const { id: ownerId } = requireAuth();
    const days = weeks * 7;

    return this.db.queryAll<{ date: string; attempts: number }>(
      `SELECT DATE(attempted_at) as date, COUNT(*) as attempts
       FROM practice_attempts
       WHERE attempted_at >= DATE('now', ? || ' days') AND owner_id = ?
       GROUP BY DATE(attempted_at) ORDER BY date ASC`,
      `-${days}`, ownerId
    );
  }
}
