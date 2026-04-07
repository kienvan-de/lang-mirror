import { db } from "./client";

export function runMigrations(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS topics (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      title       TEXT NOT NULL,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS topic_language_versions (
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sentences (
      id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      version_id    TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
      text          TEXT NOT NULL,
      notes         TEXT,
      position      INTEGER NOT NULL DEFAULT 0,
      tts_cache_key TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      sentence_id TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
      version_id  TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
      topic_id    TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_versions_topic_id ON topic_language_versions(topic_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sentences_version_id ON sentences(version_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_attempts_sentence_id ON practice_attempts(sentence_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at ON practice_attempts(attempted_at)`);

  // Default settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  insertSetting.run("practice.mode", "auto");
  insertSetting.run("tts.global.speed", "1.0");
  insertSetting.run("tts.global.pitch", "0");
  insertSetting.run("app.port", "7842");
  insertSetting.run("app.browserOpen", "true");
  insertSetting.run("practice.recordingMultiplier", "1.5");
  insertSetting.run("practice.drillPause", "1");
  insertSetting.run("practice.autoPlayback", "true");
  insertSetting.run("display.fontSize", "lg");

  console.log("✓ Database ready");
}
