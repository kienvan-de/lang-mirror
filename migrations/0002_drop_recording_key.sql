-- Migration 0002: remove recording_key and tts_cache_key from sentences
--
-- recording_key was an early design artifact that stored a single R2 key per
-- sentence row. This is incorrect because recordings are per-user — one sentence
-- can have recordings from multiple users and a single column cannot model that.
-- The column is now redundant: recordings are looked up directly from R2 using
-- the deterministic key  recordings/{userId}/{topicId}/{langCode}/sentence-{id}.{ext}
-- which is derived at runtime from the authenticated user's id and the sentence's
-- resolved version/topic, without any DB lookup.
--
-- tts_cache_key stored the last computed TTS cache key for a sentence. It was
-- never read — TTSService.resolveParams() recomputes the key fresh on every
-- request from (text, voice, speed, pitch). The column was also incorrectly
-- shared across users: different users resolve different (voice, speed, pitch)
-- tuples and produce different cache keys, so one column cannot represent all
-- of them. Dead code with an incorrect data model — dropped alongside recording_key.
--
-- SQLite does not support DROP COLUMN before version 3.35.0.
-- Cloudflare D1 supports it — this migration is safe for the CF Worker target.
-- The Bun desktop server uses SQLite via bun:sqlite which also supports it.

ALTER TABLE sentences DROP COLUMN recording_key;
ALTER TABLE sentences DROP COLUMN tts_cache_key;
