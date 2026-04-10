import type { IDatabase } from "../ports/db.port";
import type { IObjectStorage, StoredObject } from "../ports/storage.port";
import type { SentenceRow, VersionRow } from "../db/types";
import { requireAuth } from "../auth/context";
import { NotFoundError, ForbiddenError, ValidationError } from "../errors";

function r2Key(userId: string, topicId: string, langCode: string, sentenceId: string, ext: string): string {
  return `recordings/${userId}/${topicId}/${langCode}/sentence-${sentenceId}.${ext}`;
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
    if (!contentType.includes("audio")) throw new ValidationError("Content-Type must be audio/webm or audio/ogg");

    const { id: userId } = requireAuth();
    const { version } = await this.resolveVersion(sentenceId);
    const ext = contentType.includes("ogg") ? "ogg" : "webm";
    const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);

    await this.storage.put(key, data, { contentType });
    return { key };
  }

  async get(sentenceId: string): Promise<RecordingRef> {
    const { id: userId } = requireAuth();
    const { version } = await this.resolveVersion(sentenceId);

    for (const [ext, ct] of [["webm", "audio/webm"], ["ogg", "audio/ogg"]] as const) {
      const key = r2Key(userId, version.topic_id, version.language_code, sentenceId, ext);
      const obj = await this.storage.get(key);
      if (obj) return { key, contentType: obj.contentType || ct, object: obj };
    }

    throw new NotFoundError(`No recording for sentence '${sentenceId}'`);
  }

  async delete(sentenceId: string): Promise<void> {
    const { id: userId } = requireAuth();
    const { version } = await this.resolveVersion(sentenceId);
    for (const ext of ["webm", "ogg"]) {
      await this.storage.delete(r2Key(userId, version.topic_id, version.language_code, sentenceId, ext));
    }
  }

  async deleteAll(): Promise<{ deletedFiles: number; bytesFreed: number }> {
    // Admin-only — deletes all users' recordings (guarded at worker level by adminGuard)
    const objects = await this.storage.list("recordings/");
    let bytesFreed = 0;
    for (const obj of objects) {
      bytesFreed += obj.size;
      await this.storage.delete(obj.key);
    }
    return { deletedFiles: objects.length, bytesFreed };
  }
}
