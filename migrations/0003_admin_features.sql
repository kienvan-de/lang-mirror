-- Migration 0003: admin features — approval workflow
--
-- Replaces the simple published/published_at/published_by columns with a full
-- approval workflow. Topics have a status field and a separate approval request
-- table for full audit history.
--
-- Topic status state machine:
--   private (default) → pending (owner submits) → published (admin approves)
--                                               → rejected  (admin rejects)
--   rejected → pending (owner re-submits)
--   published → private (admin unpublishes directly)
--
-- No new columns on users needed — last_active_at is computed at query time
-- via MAX(practice_attempts.attempted_at).

ALTER TABLE topics ADD COLUMN status         TEXT NOT NULL DEFAULT 'private';
ALTER TABLE topics ADD COLUMN status_updated_at TEXT;
ALTER TABLE topics ADD COLUMN status_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE topics ADD COLUMN rejection_note TEXT;

CREATE TABLE IF NOT EXISTS topic_approval_requests (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
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

CREATE INDEX IF NOT EXISTS idx_topics_status      ON topics(status);
CREATE INDEX IF NOT EXISTS idx_approvals_topic    ON topic_approval_requests(topic_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status   ON topic_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_owner    ON topic_approval_requests(owner_id);
