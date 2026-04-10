// Shared types
export interface Topic {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  version_count?: number;
  versions?: Version[];
}

export interface Version {
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
  sentences?: Sentence[];
  // US-7.5 — populated by GET /api/topics/:id
  totalSentences?: number;
  practicedToday?: number;
  progressToday?: number;
}

export interface Sentence {
  id: string;
  version_id: string;
  text: string;
  /** @deprecated Use sibling version sentences instead of per-sentence translations */
  translation?: string | null;
  notes: Record<string, string> | null;
  position: number;
  tts_cache_key: string | null;
  created_at: string;
  updated_at: string;
  // US-7.4 — populated by GET /api/topics/:id
  attempt_count?: number;
  last_attempted_at?: string | null;
}

export interface Voice {
  name: string;
  shortName: string;
  locale: string;
  langCode: string;
  gender: string;
  displayName: string;
}

// Base fetch helper
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json() as T;
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "API error"), { status: res.status, data });
  return data;
}

// Topics
export const api = {
  // Topics
  getTopics: () => apiFetch<Topic[]>("/topics"),
  getTopic: (id: string) => apiFetch<Topic>(`/topics/${id}`),
  createTopic: (body: { title: string; description?: string }) =>
    apiFetch<Topic>("/topics", { method: "POST", body: JSON.stringify(body) }),
  updateTopic: (id: string, body: { title?: string; description?: string }) =>
    apiFetch<Topic>(`/topics/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTopic: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/topics/${id}`, { method: "DELETE" }),

  // Versions
  createVersion: (topicId: string, body: { language_code: string; title?: string; description?: string; voice_name?: string; speed?: number; pitch?: number }) =>
    apiFetch<Version>(`/topics/${topicId}/versions`, { method: "POST", body: JSON.stringify(body) }),
  updateVersion: (id: string, body: { title?: string | null; description?: string | null; voice_name?: string | null; speed?: number | null; pitch?: number | null }) =>
    apiFetch<Version>(`/versions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteVersion: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/versions/${id}`, { method: "DELETE" }),
  getVersion: (id: string) => apiFetch<Version>(`/versions/${id}`),
  reorderVersions: (topicId: string, ids: string[]) =>
    apiFetch<Version[]>(`/topics/${topicId}/versions/reorder`, { method: "POST", body: JSON.stringify({ ids }) }),

  // Sentences
  getSentences: (versionId: string) => apiFetch<Sentence[]>(`/versions/${versionId}/sentences`),
  createSentence: (versionId: string, body: { text: string; notes?: Record<string, string> }) =>
    apiFetch<Sentence>(`/versions/${versionId}/sentences`, { method: "POST", body: JSON.stringify(body) }),
  updateSentence: (id: string, body: { text?: string; notes?: Record<string, string> }) =>
    apiFetch<Sentence>(`/sentences/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSentence: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/sentences/${id}`, { method: "DELETE" }),
  reorderSentences: (versionId: string, ids: string[]) =>
    apiFetch<Sentence[]>(`/versions/${versionId}/sentences/reorder`, { method: "POST", body: JSON.stringify({ ids }) }),

  // Voices
  getVoices: (lang?: string) => apiFetch<Voice[]>(`/tts/voices${lang ? `?lang=${lang}` : ""}`),

  // Settings
  getSettings: () => apiFetch<Record<string, string>>("/settings"),
  getSetting: (key: string) => apiFetch<{ key: string; value: string }>(`/settings/${encodeURIComponent(key)}`),
  setSetting: (key: string, value: string) =>
    apiFetch<{ key: string; value: string }>(`/settings/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),

  // Practice attempts
  logAttempt: (body: { sentence_id: string; version_id: string; topic_id: string }) =>
    apiFetch<unknown>("/practice/attempts", { method: "POST", body: JSON.stringify(body) }),

  // Recordings
  uploadRecording: async (sentenceId: string, blob: Blob): Promise<void> => {
    const res = await fetch(`/api/recordings/${sentenceId}`, {
      method: "POST",
      body: blob,
      headers: { "Content-Type": blob.type },
    });
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error ?? "Upload failed");
    }
  },
  getRecordingUrl: (sentenceId: string) => `/api/recordings/${sentenceId}`,

  deleteAllRecordings: () =>
    apiFetch<{ deletedFiles: number; bytesFreed: number }>("/recordings", { method: "DELETE" }),

  getDataPath: () => apiFetch<{ path: string }>("/settings/data-path"),

  exportAll: async (): Promise<void> => {
    const res = await fetch("/api/export/all");
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = cd.match(/filename="([^"]+)"/);
    a.href = url;
    a.download = match?.[1] ?? "lang-mirror-export.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // Practice stats
  getDailyStats: () => apiFetch<{
    today: { attempts: number; topics: number; sentences: number };
    week: Array<{ date: string; attempts: number }>;
  }>("/practice/stats/daily"),

  getStreak: () => apiFetch<{
    currentStreak: number;
    longestStreak: number;
    lastPracticeDate: string | null;
  }>("/practice/stats/streak"),

  getRecentPractice: () => apiFetch<Array<{
    topicId: string;
    topicTitle: string;
    versionId: string;
    langCode: string;
    lastAttemptAt: string;
    sentencesAttemptedToday: number;
    totalSentences: number;
  }>>("/practice/stats/recent"),

  getCalendar: (weeks = 12) => apiFetch<Array<{ date: string; attempts: number }>>(
    `/practice/stats/calendar?weeks=${weeks}`
  ),

  // TTS Cache
  getCacheStats: () => apiFetch<{ fileCount: number; totalBytes: number; totalMB: string }>("/tts/cache/stats"),
  clearTTSCache: () => apiFetch<{ deletedFiles: number; bytesFreed: number }>("/tts/cache", { method: "DELETE" }),

  // Import
  importPreview: async (file: File): Promise<{
    ok: boolean;
    parseError: string | null;
    errors: Array<{ field: string; message: string }>;
    format: "single" | "topic" | null;
    title: string | null;
    description: string | null;
    versions: Array<{ language: string; sentenceCount: number }>;
  }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/preview", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "Preview failed"), { status: res.status, data });
    return data as ReturnType<typeof api.importPreview> extends Promise<infer T> ? T : never;
  },

  importFile: async (file: File, topicId?: string, onDuplicate: "skip" | "error" = "error"): Promise<{
    topic: Topic;
    versions: Array<{ version: Version; sentenceCount: number }>;
    totalSentences: number;
    skipped?: boolean;
  }> => {
    const fd = new FormData();
    fd.append("file", file);
    if (topicId) fd.append("topic_id", topicId);
    const res = await fetch(`/api/import?onDuplicate=${onDuplicate}`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "Import failed"), { status: res.status, data });
    return data as ReturnType<typeof api.importFile> extends Promise<infer T> ? T : never;
  },

  // ── Auth ────────────────────────────────────────────────────────────────────
  getMe: async () => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) throw new Error("Not authenticated");
    return res.json() as Promise<import("../hooks/useAuth").AuthUser>;
  },

  getProviders: () => apiFetch<Array<{ id: string; provider: string; display_name: string }>>("/auth/providers"),

  // Login is a direct browser navigation to /api/auth/login/:providerId (GET → 302)
  // No fetch call needed — use window.location.href = `/api/auth/login/${providerId}`

  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  exportTopic: async (topicId: string, topicTitle: string): Promise<void> => {
    const res = await fetch(`/api/export/${topicId}`);
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = cd.match(/filename="([^"]+)"/);
    a.href = url;
    a.download = match?.[1] ?? `${topicTitle.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};
