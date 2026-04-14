-- !! AUTO-GENERATED — do not edit by hand.
-- Source: src/core/db/schema.ts
-- To regenerate: bun run cf:schema:gen

CREATE TABLE IF NOT EXISTS oidc_providers (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
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
  );

CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
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
  );

CREATE TABLE IF NOT EXISTS topics (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'private',
    status_updated_at TEXT,
    status_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    rejection_note   TEXT,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

CREATE TABLE IF NOT EXISTS topic_language_versions (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
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
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    version_id    TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
    text          TEXT NOT NULL,
    notes         TEXT,
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

CREATE TABLE IF NOT EXISTS practice_attempts (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sentence_id  TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
    version_id   TEXT NOT NULL REFERENCES topic_language_versions(id) ON DELETE CASCADE,
    topic_id     TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (key, owner_id)
  );

CREATE TABLE IF NOT EXISTS paths (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'My Learning Path',
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

CREATE TABLE IF NOT EXISTS path_topics (
    path_id  TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (path_id, topic_id)
  );

CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    type       TEXT NOT NULL DEFAULT 'custom',
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(type, name)
  );

CREATE TABLE IF NOT EXISTS topic_tags (
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (topic_id, tag_id)
  );

CREATE TABLE IF NOT EXISTS topic_approval_requests (
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    topic_id       TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    TEXT,
    rejection_note TEXT,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users(oidc_provider_id, user_id) WHERE oidc_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_owner         ON topics(owner_id);

CREATE INDEX IF NOT EXISTS idx_topics_status        ON topics(status);

CREATE INDEX IF NOT EXISTS idx_versions_topic_id    ON topic_language_versions(topic_id);

CREATE INDEX IF NOT EXISTS idx_sentences_version_id ON sentences(version_id);

CREATE INDEX IF NOT EXISTS idx_attempts_sentence_id ON practice_attempts(sentence_id);

CREATE INDEX IF NOT EXISTS idx_attempts_owner       ON practice_attempts(owner_id);

CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at ON practice_attempts(attempted_at);

CREATE INDEX IF NOT EXISTS idx_settings_owner       ON settings(owner_id);

CREATE INDEX IF NOT EXISTS idx_topic_tags_topic ON topic_tags(topic_id);

CREATE INDEX IF NOT EXISTS idx_topic_tags_tag   ON topic_tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_tags_type        ON tags(type);

CREATE INDEX IF NOT EXISTS idx_paths_owner        ON paths(owner_id);

CREATE INDEX IF NOT EXISTS idx_path_topics_path   ON path_topics(path_id);

CREATE INDEX IF NOT EXISTS idx_path_topics_topic  ON path_topics(topic_id);

CREATE INDEX IF NOT EXISTS idx_approvals_topic    ON topic_approval_requests(topic_id);

CREATE INDEX IF NOT EXISTS idx_approvals_status   ON topic_approval_requests(status);

CREATE INDEX IF NOT EXISTS idx_approvals_owner    ON topic_approval_requests(owner_id);

-- System user (owns default settings, cannot log in)
INSERT OR IGNORE INTO users (id, oidc_provider_id, user_id, name, role) VALUES ('system', NULL, 'system', 'System', 'readonly');

-- Default system settings
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('practice.mode', 'system', 'auto');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('tts.global.speed', 'system', '1.0');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('tts.global.pitch', 'system', '0');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('practice.recordingMultiplier', 'system', '1.5');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('practice.drillPause', 'system', '1');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('practice.autoPlayback', 'system', 'true');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('display.fontSize', 'system', 'lg');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('tts.edgeTTS.trustedClientToken', 'system', '6A5AA1D4EAFF4E9FB37E23D68491D6F4');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('tts.edgeTTS.chromiumVersion', 'system', '143.0.3650.75');
INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('tts.edgeTTS.origin', 'system', 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold');

-- Default tags (seeded under system user)
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'A1', '#22c55e', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'A2', '#84cc16', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'B1', '#eab308', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'B2', '#f97316', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'C1', '#ef4444', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'C2', '#7f1d1d', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'N5', '#22c55e', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'N4', '#84cc16', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'N3', '#eab308', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'N2', '#f97316', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('level', 'N1', '#ef4444', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'en', '#3b82f6', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'ja', '#ec4899', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'vi', '#f59e0b', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'de', '#6366f1', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'fr', '#8b5cf6', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'es', '#f97316', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'zh', '#ef4444', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'ko', '#06b6d4', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'pt', '#10b981', 'system');
INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES ('language', 'ru', '#64748b', 'system');
