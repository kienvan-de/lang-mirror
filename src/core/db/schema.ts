/**
 * Single source of truth for the database schema.
 *
 * Used by:
 *   - src/core/db/migrations.ts  → runMigrations(db: IDatabase)
 *   - migrations/0001_initial_schema.sql  → wrangler d1 migrations apply (keep in sync manually)
 *
 * Each entry in DDL_STATEMENTS is one complete SQL statement — no semicolons needed
 * as each is executed individually via db.exec().
 */

export const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS topics (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    title       TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS topic_language_versions (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    topic_id      TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,
    title         TEXT,
    description   TEXT,
    voice_name    TEXT,
    speed         REAL,
    pitch         REAL,
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(topic_id, language_code)
  )`,

  `CREATE TABLE IF NOT EXISTS sentences (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    version_id    TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
    text          TEXT NOT NULL,
    notes         TEXT,
    position      INTEGER NOT NULL DEFAULT 0,
    tts_cache_key TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS practice_attempts (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    sentence_id  TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    version_id   TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
    topic_id     TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_versions_topic_id     ON topic_language_versions(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sentences_version_id  ON sentences(version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_sentence_id  ON practice_attempts(sentence_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at ON practice_attempts(attempted_at)`,
];

export const DEFAULT_SETTINGS: [string, string][] = [
  ["practice.mode",                "auto"],
  ["tts.global.speed",             "1.0"],
  ["tts.global.pitch",             "0"],
  ["practice.recordingMultiplier", "1.5"],
  ["practice.drillPause",          "1"],
  ["practice.autoPlayback",        "true"],
  ["display.fontSize",             "lg"],
];
