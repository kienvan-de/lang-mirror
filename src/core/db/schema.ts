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
    oidc_provider_id  TEXT REFERENCES oidc_providers(id) ON DELETE RESTRICT,
    user_id           TEXT NOT NULL,
    email             TEXT,
    email_verified    INTEGER NOT NULL DEFAULT 0,
    name              TEXT,
    avatar_url        TEXT,
    role              TEXT NOT NULL DEFAULT 'user',
    is_active         INTEGER NOT NULL DEFAULT 1,
    deactivated_at    TEXT,
    deactivated_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    deactivation_reason TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Topics ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS topics (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'private',
    status_updated_at TEXT,
    status_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    rejection_note   TEXT,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Practice attempts ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS practice_attempts (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sentence_id  TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    version_id   TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
    topic_id     TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Settings (composite PK: key + owner_id) ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS settings (
    key        TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (key, owner_id)
  )`,

  // ── Learning paths ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS paths (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'My Learning Path',
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Path topics (ordered join) ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS path_topics (
    path_id  TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (path_id, topic_id)
  )`,

  // ── Tags ──────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    type       TEXT NOT NULL DEFAULT 'custom',
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(type, name)
  )`,

  // ── Topic tags (join table) ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS topic_tags (
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (topic_id, tag_id)
  )`,

  // ── Topic approval requests ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS topic_approval_requests (
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    topic_id       TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    TEXT,
    rejection_note TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,

  // ── Indexes ───────────────────────────────────────────────────────────────
  // Enforce uniqueness for real OIDC users only (system user has no oidc_provider_id)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_provider_id, user_id) WHERE oidc_provider_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_topics_owner         ON topics(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_topics_status        ON topics(status)`,
  `CREATE INDEX IF NOT EXISTS idx_versions_topic_id    ON topic_language_versions(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sentences_version_id ON sentences(version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_sentence_id ON practice_attempts(sentence_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_owner       ON practice_attempts(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at ON practice_attempts(attempted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_settings_owner       ON settings(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_topic_tags_topic ON topic_tags(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_topic_tags_tag   ON topic_tags(tag_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tags_type        ON tags(type)`,
  `CREATE INDEX IF NOT EXISTS idx_paths_owner        ON paths(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_path_topics_path   ON path_topics(path_id)`,
  `CREATE INDEX IF NOT EXISTS idx_path_topics_topic  ON path_topics(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_topic    ON topic_approval_requests(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_status   ON topic_approval_requests(status)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_owner    ON topic_approval_requests(owner_id)`,
];

export const DEFAULT_SETTINGS: [string, string][] = [
  ["practice.mode",                "auto"],
  ["tts.global.speed",             "1.0"],
  ["tts.global.pitch",             "0"],
  ["practice.recordingMultiplier", "1.5"],
  ["practice.drillPause",          "1"],
  ["practice.autoPlayback",        "true"],
  ["display.fontSize",             "lg"],
  // Edge TTS protocol constants — update these in DB when Microsoft rotates them,
  // no deploy required. Values below match edge-tts-universal v1.4.0 / Chrome 143.
  ["tts.edgeTTS.trustedClientToken", "6A5AA1D4EAFF4E9FB37E23D68491D6F4"],
  ["tts.edgeTTS.chromiumVersion",    "143.0.3650.75"],
  ["tts.edgeTTS.origin",             "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"],
  // Note: app.baseUrl is intentionally NOT seeded here — it is dev-only.
  // Set explicitly for local CF dev via: bun run cf:seed:mock
];

/** Well-known system user — owns all default settings. Role 'readonly' = no privileges. */
export const SYSTEM_USER_ID = "system";

/** Default tags seeded on first run */
export const DEFAULT_TAGS: { type: string; name: string; color: string }[] = [
  // CEFR levels
  { type: "level", name: "A1", color: "#22c55e" },
  { type: "level", name: "A2", color: "#84cc16" },
  { type: "level", name: "B1", color: "#eab308" },
  { type: "level", name: "B2", color: "#f97316" },
  { type: "level", name: "C1", color: "#ef4444" },
  { type: "level", name: "C2", color: "#7f1d1d" },
  // JLPT levels
  { type: "level", name: "N5", color: "#22c55e" },
  { type: "level", name: "N4", color: "#84cc16" },
  { type: "level", name: "N3", color: "#eab308" },
  { type: "level", name: "N2", color: "#f97316" },
  { type: "level", name: "N1", color: "#ef4444" },
  // Languages
  { type: "language", name: "en", color: "#3b82f6" },
  { type: "language", name: "ja", color: "#ec4899" },
  { type: "language", name: "vi", color: "#f59e0b" },
  { type: "language", name: "de", color: "#6366f1" },
  { type: "language", name: "fr", color: "#8b5cf6" },
  { type: "language", name: "es", color: "#f97316" },
  { type: "language", name: "zh", color: "#ef4444" },
  { type: "language", name: "ko", color: "#06b6d4" },
  { type: "language", name: "pt", color: "#10b981" },
  { type: "language", name: "ru", color: "#64748b" },
];
