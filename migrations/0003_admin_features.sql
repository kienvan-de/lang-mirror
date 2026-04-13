-- Migration 0003: admin features
--
-- 1. Add published columns to topics for admin-controlled topic visibility.
--    published=0 (default) = private, only owner can see it.
--    published=1 = public, visible to all authenticated users.
--    published_by tracks which admin published it.
--
-- 2. No new columns needed on users for last_active_at — computed at query
--    time via MAX(practice_attempts.attempted_at) per user.

ALTER TABLE topics ADD COLUMN published    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN published_at TEXT;
ALTER TABLE topics ADD COLUMN published_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_topics_published ON topics(published);
