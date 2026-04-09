/**
 * Database row interfaces — single source of truth for both server and worker.
 * These mirror the schema defined in src/core/db/schema.ts exactly.
 */

export interface TopicRow {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  id: string;
  topic_id: string;
  language_code: string;
  title: string | null;
  description: string | null;
  voice_name: string | null;
  speed: number | null;
  pitch: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SentenceRow {
  id: string;
  version_id: string;
  text: string;
  /** JSON string: Record<uiLang, markdown> — parse before returning to client */
  notes: string | null;
  position: number;
  tts_cache_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface PracticeAttemptRow {
  id: string;
  sentence_id: string;
  version_id: string;
  topic_id: string;
  attempted_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

/** Sentence with parsed notes object (ready for API response) */
export type SentenceWithNotes = Omit<SentenceRow, "notes"> & {
  notes: Record<string, string> | null;
};

/** Sentence enriched with practice stats */
export type EnrichedSentence = SentenceWithNotes & {
  attempt_count: number;
  last_attempted_at: string | null;
};

/** Version enriched with sentences and progress */
export type EnrichedVersion = VersionRow & {
  sentences: EnrichedSentence[];
  totalSentences: number;
  practicedToday: number;
  progressToday: number;
};

/** Topic enriched with versions (for GET /api/topics/:id) */
export type EnrichedTopic = TopicRow & {
  versions: EnrichedVersion[];
};

/** Lightweight version meta (for GET /api/topics list) */
export type VersionMeta = Pick<VersionRow, "id" | "topic_id" | "language_code" | "title" | "description" | "position">;

/** Topic list item (for GET /api/topics) */
export type TopicListItem = TopicRow & {
  version_count: number;
  versions: VersionMeta[];
};
