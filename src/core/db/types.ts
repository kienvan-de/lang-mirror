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
  oidc_provider_id: string | null; // NULL for system user
  user_id: string;                 // OIDC sub claim; 'system' for system user
  email: string | null;
  email_verified: number;          // 1 = true, 0 = false
  name: string | null;
  avatar_url: string | null;
  role: "user" | "admin" | "readonly"; // 'readonly' = system user, no privileges
  is_active: number;               // 1 = active, 0 = deactivated
  deactivated_at: string | null;
  deactivated_by: string | null;
  deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopicRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: "private" | "pending" | "published" | "rejected";
  status_updated_at: string | null;
  status_updated_by: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequestRow {
  id: string;
  topic_id: string;
  owner_id: string;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface PracticeAttemptRow {
  id: string;
  owner_id: string;
  sentence_id: string;
  version_id: string;
  topic_id: string;
  attempted_at: string;
}

export interface SettingRow {
  key: string;
  owner_id: string; // 'system' = system default; user id = user/admin override
  value: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  type: string;       // 'level' | 'language' | 'custom'
  name: string;
  color: string;      // hex color e.g. '#6366f1'
  created_by: string;
  created_at: string;
}

export interface TopicTagRow {
  topic_id: string;
  tag_id: string;
}

export interface PathRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface PathTopicRow {
  path_id: string;
  topic_id: string;
  position: number;
}

export interface PathTopicVersion {
  language_code: string;
  title: string | null;
}

export interface PathTopicItem {
  topic_id: string;
  topic_title: string;       // base topic title
  topic_versions: PathTopicVersion[]; // for language-aware display
  position: number;
  tags: TagRow[];
  totalSentences: number;
  practicedSentences: number;
  isDone: boolean;
}

export interface PathWithTopics extends PathRow {
  topics: PathTopicItem[];
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
  tags: TagRow[];
};

export type VersionMeta = Pick<VersionRow,
  "id" | "topic_id" | "language_code" | "title" | "description" | "position"
>;

export type TopicListItem = TopicRow & {
  version_count: number;
  versions: VersionMeta[];
  tags: TagRow[];
};

export type AdminTopicListItem = TopicRow & {
  version_count: number;
  versions: VersionMeta[];
  tags: TagRow[];
  owner_name: string | null;
  owner_email: string | null;
  sentence_count: number;
  // latest approval request (if any)
  latest_request_id: string | null;
  latest_request_status: string | null;
  latest_request_note: string | null;
};

export type ApprovalRequestWithTopic = ApprovalRequestRow & {
  topic_title: string;
  topic_description: string | null;
  topic_status: string;
  owner_name: string | null;
  owner_email: string | null;
  version_count: number;
  sentence_count: number;
  language_codes: string | null; // comma-separated
};

export type AdminUserRow = UserRow & {
  last_active_at: string | null;
  topic_count: number;
  attempt_count: number;
};
