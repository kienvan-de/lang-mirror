import { json, error } from "../lib/response";
import { db } from "../db/client";

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // POST /api/practice/attempts
  if (method === "POST" && path === "/api/practice/attempts") {
    return logAttempt(req);
  }

  // GET /api/practice/stats/daily
  if (method === "GET" && path === "/api/practice/stats/daily") {
    return getDailyStats();
  }

  // GET /api/practice/stats/streak
  if (method === "GET" && path === "/api/practice/stats/streak") {
    return getStreak();
  }

  // GET /api/practice/stats/recent
  if (method === "GET" && path === "/api/practice/stats/recent") {
    return getRecent();
  }

  // GET /api/practice/stats/calendar
  if (method === "GET" && path === "/api/practice/stats/calendar") {
    const weeks = parseInt(url.searchParams.get("weeks") ?? "12", 10);
    return getCalendar(weeks);
  }

  return error("not found", 404);
}

// ── POST /api/practice/attempts ───────────────────────────────────────────────

async function logAttempt(req: Request): Promise<Response> {
  let body: { sentence_id?: string; version_id?: string; topic_id?: string };
  try { body = await req.json() as typeof body; }
  catch { return error("Invalid JSON body", 400); }

  if (!body.sentence_id) return error("sentence_id is required", 400);
  if (!body.version_id)  return error("version_id is required", 400);
  if (!body.topic_id)    return error("topic_id is required", 400);

  const s = db.prepare("SELECT id FROM sentences WHERE id = ?").get(body.sentence_id);
  if (!s) return error("Sentence not found", 404);

  db.prepare(`
    INSERT INTO practice_attempts (sentence_id, version_id, topic_id)
    VALUES (?, ?, ?)
  `).run(body.sentence_id, body.version_id, body.topic_id);

  const attempt = db.prepare(
    "SELECT * FROM practice_attempts WHERE sentence_id = ? ORDER BY attempted_at DESC LIMIT 1"
  ).get(body.sentence_id);
  return json(attempt, 201);
}

// ── GET /api/practice/stats/daily ────────────────────────────────────────────

function getDailyStats(): Response {
  const today = db.prepare(`
    SELECT
      COUNT(*) as attempts,
      COUNT(DISTINCT topic_id) as topics,
      COUNT(DISTINCT sentence_id) as sentences
    FROM practice_attempts
    WHERE DATE(attempted_at) = DATE('now')
  `).get() as { attempts: number; topics: number; sentences: number };

  const week = db.prepare(`
    SELECT DATE(attempted_at) as date, COUNT(*) as attempts
    FROM practice_attempts
    WHERE attempted_at >= DATE('now', '-6 days')
    GROUP BY DATE(attempted_at)
    ORDER BY date ASC
  `).all() as Array<{ date: string; attempts: number }>;

  return json({ today, week });
}

// ── GET /api/practice/stats/streak ───────────────────────────────────────────

function getStreak(): Response {
  // Get all distinct practice dates descending
  const dates = (db.prepare(`
    SELECT DISTINCT DATE(attempted_at) as date
    FROM practice_attempts
    ORDER BY date DESC
  `).all() as Array<{ date: string }>).map((r) => r.date);

  if (dates.length === 0) {
    return json({ currentStreak: 0, longestStreak: 0, lastPracticeDate: null });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Current streak: count consecutive days from today (or yesterday)
  let currentStreak = 0;
  const dateSet = new Set(dates);
  const startDate = dateSet.has(todayStr) ? todayStr : dateSet.has(yesterdayStr) ? yesterdayStr : null;

  if (startDate) {
    let d = new Date(startDate + "T12:00:00Z");
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (!dateSet.has(ds)) break;
      currentStreak++;
      d = new Date(d.getTime() - 86_400_000);
    }
  }

  // Longest streak: iterate all dates sorted ascending
  const sortedDates = [...dates].sort();
  let longest = 1, run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]! + "T12:00:00Z");
    const curr = new Date(sortedDates[i]! + "T12:00:00Z");
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return json({
    currentStreak,
    longestStreak: Math.max(longest, currentStreak),
    lastPracticeDate: dates[0] ?? null,
  });
}

// ── GET /api/practice/stats/recent ───────────────────────────────────────────

function getRecent(): Response {
  // Last 3 distinct topic+language combos practiced, with stats
  const rows = db.prepare(`
    SELECT
      pa.topic_id as topicId,
      t.title as topicTitle,
      pa.version_id as versionId,
      v.language_code as langCode,
      MAX(pa.attempted_at) as lastAttemptAt,
      (
        SELECT COUNT(DISTINCT pa2.sentence_id)
        FROM practice_attempts pa2
        WHERE pa2.version_id = pa.version_id
          AND DATE(pa2.attempted_at) = DATE('now')
      ) as sentencesAttemptedToday,
      (
        SELECT COUNT(*) FROM sentences s WHERE s.version_id = pa.version_id
      ) as totalSentences
    FROM practice_attempts pa
    JOIN topics t ON t.id = pa.topic_id
    JOIN topic_language_versions v ON v.id = pa.version_id
    GROUP BY pa.topic_id, pa.version_id
    ORDER BY lastAttemptAt DESC
    LIMIT 3
  `).all();

  return json(rows);
}

// ── GET /api/practice/stats/calendar ─────────────────────────────────────────

function getCalendar(weeks: number): Response {
  const days = weeks * 7;
  const rows = db.prepare(`
    SELECT DATE(attempted_at) as date, COUNT(*) as attempts
    FROM practice_attempts
    WHERE attempted_at >= DATE('now', ? || ' days')
    GROUP BY DATE(attempted_at)
    ORDER BY date ASC
  `).all(`-${days}`) as Array<{ date: string; attempts: number }>;

  return json(rows);
}
