import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage, StoredObject } from "../ports/storage.port";
import type { SentenceRow, VersionRow } from "../db/types";
import { requireAuth, canAccess } from "../auth/context";
import { NotFoundError, ForbiddenError, ValidationError } from "../errors";

// ── Storage key helpers ───────────────────────────────────────────────────────

/**
 * Deterministic R2 key for a user's recording of a sentence.
 * Derived entirely from server-side values — never from client input.
 *
 *   recordings/{userId}/{topicId}/{langCode}/sentence-{sentenceId}.{ext}
 */
function r2Key(userId: string, topicId: string, langCode: string, sentenceId: string, ext: string): string {
  return `recordings/${userId}/${topicId}/${langCode}/sentence-${sentenceId}.${ext}`;
}

/**
 * Canonical MIME type map — only these values are ever stored in R2 metadata
 * or echoed back in response headers, regardless of what the client sent.
 * Prevents header-injection via a crafted Content-Type value.
 */
const CANONICAL_CONTENT_TYPE: Record<string, string> = {
  "audio/webm": "audio/webm",
  "audio/ogg":  "audio/ogg",
  "audio/mp4":  "audio/mp4",
  "audio/mpeg": "audio/mpeg",
  "audio/wav":  "audio/wav",
};

const EXT_TO_MIME: Record<string, string> = {
  webm: "audio/webm",
  ogg:  "audio/ogg",
  mp4:  "audio/mp4",
  mp3:  "audio/mpeg",
  wav:  "audio/wav",
};

function canonicalContentType(baseType: string): string {
  return CANONICAL_CONTENT_TYPE[baseType] ?? "audio/webm";
}

function extFromContentType(contentType: string): string {
  if (contentType.includes("ogg"))  return "ogg";
  if (contentType.includes("mp4"))  return "mp4";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav"))  return "wav";
  return "webm";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecordingRef {
  key: string;
  contentType: string;
  object: StoredObject;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RecordingsService {
  constructor(
    private db: IDatabase,
    private storage: IObjectStorage,
  ) {}

  /**
   * Resolve sentence → version → topic, then verify the caller owns the topic.
   * Throws NotFoundError or ForbiddenError — never leaks existence of records
   * the caller cannot access.
   */
  private async resolveAndAuthorise(sentenceId: string): Promise<{ sentence: SentenceRow; version: VersionRow }> {
    const sentence = await this.db.queryFirst<SentenceRow>(
      "SELECT * FROM sentences WHERE id = ?", sentenceId
    );
    if (!sentence) throw new NotFoundError(`Sentence '${sentenceId}' not found`);

    const version = await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", sentence.version_id
    );
    if (!version) throw new NotFoundError("Version not found");

    // Access check — topic must be owned by the caller OR published (shared).
    // canAccess() is intentionally NOT used here: that checks topic ownership,
    // but recordings belong to the caller regardless of who owns the topic.
    // A user can record any topic they can access (own or published).
    const auth = requireAuth();
    const topic = await this.db.queryFirst<{ owner_id: string; status: string }>(
      "SELECT owner_id, status FROM topics WHERE id = ?", version.topic_id
    );
    if (!topic) throw new NotFoundError("Topic not found");
    const canAccessTopic = topic.owner_id === auth.id
      || topic.status === "published"
      || auth.role === "admin";
    if (!canAccessTopic) throw new ForbiddenError("You do not have access to this topic");

    return { sentence, version };
  }

  async upload(
    sentenceId: string,
    data: ArrayBuffer | ReadableStream<Uint8Array>,
    contentType: string
  ): Promise<{ key: string }> {
    if (!contentType.startsWith("audio/")) {
      throw new ValidationError("Content-Type must be an audio/* type");
    }

    // resolveAndAuthorise calls requireAuth() internally — userId comes from there
    const { id: userId } = requireAuth();
    const { version } = await this.resolveAndAuthorise(sentenceId);

    // Normalise to a canonical MIME type — never store the raw client-supplied value
    const safeContentType = canonicalContentType(contentType);
    const ext = extFromContentType(safeContentType);
    const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);

    await this.storage.put(key, data, { contentType: safeContentType });

    return { key };
  }

  async get(sentenceId: string): Promise<RecordingRef> {
    // requireAuth() must be called before resolveAndAuthorise so auth.id is available
    const { id: userId } = requireAuth();

    // Ownership: only the topic owner (or admin) may fetch the recording
    const { version } = await this.resolveAndAuthorise(sentenceId);

    // Derive the R2 key at runtime — no DB column needed
    // Try all supported extensions to find whichever file exists
    const extensions = ["webm", "ogg", "mp4", "mp3", "wav"];
    for (const ext of extensions) {
      const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);
      const obj = await this.storage.get(key);
      if (obj) {
        const contentType = EXT_TO_MIME[ext] ?? "audio/webm";
        return { key, contentType, object: obj };
      }
    }

    throw new NotFoundError(`No recording for sentence '${sentenceId}'`);
  }

  async delete(sentenceId: string): Promise<void> {
    // requireAuth() must be called before resolveAndAuthorise so auth.id is available
    const { id: userId } = requireAuth();

    // Ownership: only the topic owner (or admin) may delete the recording
    const { version } = await this.resolveAndAuthorise(sentenceId);

    // Delete all possible extension variants for this user's recording
    const extensions = ["webm", "ogg", "mp4", "mp3", "wav"];
    for (const ext of extensions) {
      const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);
      await this.storage.delete(key); // no-op if key does not exist
    }
  }

  /**
   * Returns the set of sentenceIds for which the current user has a recording
   * in the given version. Probes R2 by listing the caller's own prefix only —
   * no ownership check needed since the R2 key is scoped to the caller's userId.
   * Works for both owned and published (shared) topics.
   */
  async hasRecordingsForVersion(versionId: string): Promise<Set<string>> {
    const { id: userId } = requireAuth();

    const version = await this.db.queryFirst<{ topic_id: string; language_code: string }>(
      "SELECT v.topic_id, v.language_code FROM topic_language_versions v WHERE v.id = ?", versionId
    );
    if (!version) throw new NotFoundError(`Version '${versionId}' not found`);

    // No topic ownership check — we only read from recordings/{userId}/... which
    // is already scoped to the caller. Any authenticated user can check their own
    // recordings for any version they can access (owned or published).
    const prefix = `recordings/${userId}/${version.topic_id}/${version.language_code}/`;

    const sentenceIds = new Set<string>();
    let cursor: string | undefined;

    do {
      const page = await this.storage.list(prefix, { cursor, limit: 1000 });

      for (const obj of page.objects) {
        // key format: recordings/{userId}/{topicId}/{langCode}/sentence-{sentenceId}.{ext}
        const filename = obj.key.slice(prefix.length);
        const match = filename.match(/^sentence-([^.]+)\./);
        if (match) sentenceIds.add(match[1]!);
      }

      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return sentenceIds;
  }

  async deleteAll(): Promise<{ deletedFiles: number; bytesFreed: number }> {
    // Admin-only — deletes all users' recordings (guarded at route level by adminGuard)
    // Paginate through R2 to handle >1000 objects
    let cursor: string | undefined;
    let deletedFiles = 0;
    let bytesFreed = 0;

    do {
      const page = await this.storage.list("recordings/", { cursor, limit: 1000 });

      if (page.objects.length > 0) {
        bytesFreed  += page.objects.reduce((sum, o) => sum + o.size, 0);
        await this.storage.deleteBatch(page.objects.map(o => o.key));
        deletedFiles += page.objects.length;
      }

      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return { deletedFiles, bytesFreed };
  }
}
