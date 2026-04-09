-- Migration 0001: Initial schema
-- Applied via: wrangler d1 migrations apply lang-mirror-db [--local]

CREATE TABLE IF NOT EXISTS topics (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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
);

CREATE TABLE IF NOT EXISTS sentences (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  version_id    TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  notes         TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  tts_cache_key TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  sentence_id  TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
  version_id   TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
  topic_id     TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_versions_topic_id     ON topic_language_versions(topic_id);
CREATE INDEX IF NOT EXISTS idx_sentences_version_id  ON sentences(version_id);
CREATE INDEX IF NOT EXISTS idx_attempts_sentence_id  ON practice_attempts(sentence_id);
CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at ON practice_attempts(attempted_at);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('practice.mode',                'auto');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tts.global.speed',             '1.0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('tts.global.pitch',             '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('practice.recordingMultiplier', '1.5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('practice.drillPause',          '1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('practice.autoPlayback',        'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('display.fontSize',             'lg');
