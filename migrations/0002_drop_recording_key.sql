-- Migration 0002: remove recording_key from sentences
--
-- recording_key was an early design artifact that stored a single R2 key per
-- sentence row. This is incorrect because recordings are per-user — one sentence
-- can have recordings from multiple users and a single column cannot model that.
-- The column is now redundant: recordings are looked up directly from R2 using
-- the deterministic key  recordings/{userId}/{topicId}/{langCode}/sentence-{id}.{ext}
-- which is derived at runtime from the authenticated user's id and the sentence's
-- resolved version/topic, without any DB lookup.
--
-- SQLite does not support DROP COLUMN before version 3.35.0.
-- Cloudflare D1 supports it — this migration is safe for the CF Worker target.
-- The Bun desktop server uses SQLite via bun:sqlite which also supports it.

ALTER TABLE sentences DROP COLUMN recording_key;
