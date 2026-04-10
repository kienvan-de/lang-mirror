/**
 * Single source of truth for the database schema.
 * Edit directly — no separate migration files during development.
 *
 * Each entry in DDL_STATEMENTS is one complete SQL statement executed individually.
 */

export const DDL_STATEMENTS: string[] = [

  // ── OIDC providers ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS oidc_providers (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    provider      TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    client_id     TEXT NOT NULL,
    client_secret TEXT,
    redirect_uri  TEXT NOT NULL,
    auth_url      TEXT NOT NULL,
    token_url     TEXT NOT NULL,
    userinfo_url  TEXT NOT NULL,
    scope         TEXT NOT NULL DEFAULT 'openid email profile',
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Users ─────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    oidc_provider_id  TEXT NOT NULL REFERENCES oidc_providers(id) ON DELETE RESTRICT,
    user_id           TEXT NOT NULL,
    email             TEXT,
    email_verified    INTEGER NOT NULL DEFAULT 0,
    name              TEXT,
    avatar_url        TEXT,
    role              TEXT NOT NULL DEFAULT 'user',
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(oidc_provider_id, user_id)
  )`,

  // ── Topics ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS topics (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Topic language versions ───────────────────────────────────────────────
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

  // ── Sentences ─────────────────────────────────────────────────────────────
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

  // ── Practice attempts ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS practice_attempts (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    owner_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    sentence_id  TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    version_id   TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
    topic_id     TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Settings (composite PK: key + owner_id, NULL owner = system default) ──
  `CREATE TABLE IF NOT EXISTS settings (
    key        TEXT NOT NULL,
    owner_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (key, owner_id)
  )`,

  // ── Indexes ───────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_users_oidc           ON users(oidc_provider_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_topics_owner         ON topics(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_versions_topic_id    ON topic_language_versions(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sentences_version_id ON sentences(version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_sentence_id ON practice_attempts(sentence_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_owner       ON practice_attempts(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at ON practice_attempts(attempted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_settings_owner       ON settings(owner_id)`,

  // Enforce one system-default row per key (owner_id IS NULL).
  // SQLite PRIMARY KEY allows multiple NULLs — this index prevents duplicates.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_system_key ON settings(key) WHERE owner_id IS NULL`,
];

export const DEFAULT_SETTINGS: [string, string][] = [
  ["practice.mode",                "auto"],
  ["tts.global.speed",             "1.0"],
  ["tts.global.pitch",             "0"],
  ["practice.recordingMultiplier", "1.5"],
  ["practice.drillPause",          "1"],
  ["practice.autoPlayback",        "true"],
  ["display.fontSize",             "lg"],
  // Note: app.baseUrl is intentionally NOT seeded here.
  // It is an optional override — when absent, redirects are relative (production default).
  // Set explicitly for local CF dev via: bun run cf:seed:mock
];
