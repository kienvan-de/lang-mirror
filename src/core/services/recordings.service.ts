import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage, StoredObject } from "../ports/storage.port";
import type { SentenceRow, VersionRow } from "../db/types";
import { requireAuth } from "../auth/context";
import { NotFoundError, ValidationError } from "../errors";

function r2Key(userId: string, topicId: string, langCode: string, sentenceId: string, ext: string): string {
  return `recordings/${userId}/${topicId}/${langCode}/sentence-${sentenceId}.${ext}`;
}

function extFromContentType(contentType: string): string {
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "webm";
}

export interface RecordingRef {
  key: string;
  contentType: string;
  object: StoredObject;
}

export class RecordingsService {
  constructor(
    private db: IDatabase,
    private storage: IObjectStorage,
  ) {}

  private async resolveVersion(sentenceId: string): Promise<{ sentence: SentenceRow; version: VersionRow }> {
    const sentence = await this.db.queryFirst<SentenceRow>(
      "SELECT * FROM sentences WHERE id = ?", sentenceId
    );
    if (!sentence) throw new NotFoundError(`Sentence '${sentenceId}' not found`);

    const version = await this.db.queryFirst<VersionRow>(
      "SELECT * FROM topic_language_versions WHERE id = ?", sentence.version_id
    );
    if (!version) throw new NotFoundError("Version not found");

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

    const { id: userId } = requireAuth();
    const { version } = await this.resolveVersion(sentenceId);

    const ext = extFromContentType(contentType);
    const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);

    // Write to object storage
    await this.storage.put(key, data, { contentType });

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

    // Single DB read → direct key lookup (no double R2 round-trip)
    const sentence = await this.db.queryFirst<SentenceRow>(
      "SELECT recording_key FROM sentences WHERE id = ?", sentenceId
    );
    if (!sentence?.recording_key) {
      throw new NotFoundError(`No recording for sentence '${sentenceId}'`);
    }

    const obj = await this.storage.get(sentence.recording_key);
    if (!obj) throw new NotFoundError(`Recording file missing for sentence '${sentenceId}'`);

    const ext = sentence.recording_key.split(".").pop() ?? "webm";
    const contentType = obj.contentType !== "application/octet-stream"
      ? obj.contentType
      : `audio/${ext}`;

    return { key: sentence.recording_key, contentType, object: obj };
  }

  async delete(sentenceId: string): Promise<void> {
    requireAuth();

    const sentence = await this.db.queryFirst<SentenceRow>(
      "SELECT recording_key FROM sentences WHERE id = ?", sentenceId
    );
    if (sentence?.recording_key) {
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
