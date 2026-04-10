/**
 * Database row interfaces — single source of truth for both server and worker.
 */

export interface OidcProviderRow {
  id: string;
  provider: string;
  display_name: string;
  client_id: string;
  client_secret: string | null;
  redirect_uri: string;
  auth_url: string;
  token_url: string;
  userinfo_url: string;
  scope: string;
  enabled: number; // 1 = true, 0 = false (SQLite boolean)
  created_at: string;
}

/** Public shape — never expose client_secret */
export type PublicOidcProvider = Omit<OidcProviderRow, "client_secret" | "client_id">;

export interface UserRow {
  id: string;
  oidc_provider_id: string;
  user_id: string;         // OIDC sub claim
  email: string | null;
  email_verified: number;  // 1 = true, 0 = false
  name: string | null;
  avatar_url: string | null;
  role: "user" | "admin";
  created_at: string;
  updated_at: string;
}

export interface TopicRow {
  id: string;
  owner_id: string | null;
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
  /** JSON string: Record<uiLang, markdown> */
  notes: string | null;
  position: number;
  tts_cache_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface PracticeAttemptRow {
  id: string;
  owner_id: string | null;
  sentence_id: string;
  version_id: string;
  topic_id: string;
  attempted_at: string;
}

export interface SettingRow {
  key: string;
  owner_id: string | null; // NULL = system default
  value: string;
  updated_at: string;
}

// ── Derived / enriched types ──────────────────────────────────────────────────

export type SentenceWithNotes = Omit<SentenceRow, "notes"> & {
  notes: Record<string, string> | null;
};

export type EnrichedSentence = SentenceWithNotes & {
  attempt_count: number;
  last_attempted_at: string | null;
};

export type EnrichedVersion = VersionRow & {
  sentences: EnrichedSentence[];
  totalSentences: number;
  practicedToday: number;
  progressToday: number;
};

export type EnrichedTopic = TopicRow & {
  versions: EnrichedVersion[];
};

export type VersionMeta = Pick<VersionRow,
  "id" | "topic_id" | "language_code" | "title" | "description" | "position"
>;

export type TopicListItem = TopicRow & {
  version_count: number;
  versions: VersionMeta[];
};
