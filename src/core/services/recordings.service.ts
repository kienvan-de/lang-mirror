import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage, StoredObject } from "../ports/storage.port";
import type { SentenceRow, VersionRow, TopicRow } from "../db/types";
import { requireAuth, canAccess } from "../auth/context";
import { NotFoundError, ForbiddenError, ValidationError } from "../errors";

// ── Storage key helpers ───────────────────────────────────────────────────────

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
   * Resolve sentence → version, then verify the caller owns the parent topic.
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

    // Ownership check — join up to the topic's owner_id
    const topic = await this.db.queryFirst<{ owner_id: string }>(
      "SELECT owner_id FROM topics WHERE id = ?", version.topic_id
    );
    if (!topic) throw new NotFoundError("Topic not found");
    if (!canAccess(topic.owner_id)) throw new ForbiddenError("You do not own this recording");

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

    // requireAuth() must be called before resolveAndAuthorise so auth.id is available
    const { id: userId } = requireAuth();

    // Ownership: ensures the sentence belongs to a topic the caller owns
    const { version } = await this.resolveAndAuthorise(sentenceId);

    // Normalise to a canonical MIME type — never store the raw client-supplied value
    const safeContentType = canonicalContentType(contentType);
    const ext = extFromContentType(safeContentType);
    const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);

    // Write to object storage
    await this.storage.put(key, data, { contentType: safeContentType });

    // Persist key to DB — single source of truth for this user's recording
    await this.db.run(
      `UPDATE sentences SET recording_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      key, sentenceId
    );

    return { key };
  }

  async get(sentenceId: string): Promise<RecordingRef> {
    requireAuth();

    // Ownership: only the topic owner (or admin) may fetch the recording
    const { sentence } = await this.resolveAndAuthorise(sentenceId);

    if (!sentence.recording_key) {
      throw new NotFoundError(`No recording for sentence '${sentenceId}'`);
    }

    const obj = await this.storage.get(sentence.recording_key);
    if (!obj) throw new NotFoundError(`Recording file missing for sentence '${sentenceId}'`);

    // Derive content type from the stored key extension — never trust R2 metadata
    // directly in case it was written by an older version without canonicalisation.
    const ext = sentence.recording_key.split(".").pop() ?? "webm";
    const extToMime: Record<string, string> = {
      webm: "audio/webm",
      ogg:  "audio/ogg",
      mp4:  "audio/mp4",
      mp3:  "audio/mpeg",
      wav:  "audio/wav",
    };
    const contentType = extToMime[ext] ?? "audio/webm";

    return { key: sentence.recording_key, contentType, object: obj };
  }

  async delete(sentenceId: string): Promise<void> {
    requireAuth();

    // Ownership: only the topic owner (or admin) may delete the recording
    const { sentence } = await this.resolveAndAuthorise(sentenceId);

    if (sentence.recording_key) {
      await this.storage.delete(sentence.recording_key);
      await this.db.run(
        `UPDATE sentences SET recording_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
        sentenceId
      );
    }
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
