import type { IObjectStorage, ListResult, StoredObject } from "../../core/ports/storage.port";

/**
 * Cloudflare R2 adapter implementing IObjectStorage.
 * A single R2Adapter instance handles one R2 bucket.
 * Use separate instances for TTS cache and recordings.
 */
export class R2Adapter implements IObjectStorage {
  constructor(private bucket: R2Bucket) {}

  async get(key: string): Promise<StoredObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;

    return {
      body:        obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size:        obj.size,
    };
  }

  async put(
    key: string,
    data: ArrayBuffer | ReadableStream<Uint8Array>,
    opts?: { contentType?: string }
  ): Promise<void> {
    await this.bucket.put(key, data, {
      httpMetadata: opts?.contentType ? { contentType: opts.contentType } : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /** R2 natively accepts an array of keys — single round-trip for up to 1000 keys */
  async deleteBatch(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.bucket.delete(keys);
  }

  async list(prefix?: string, opts?: { cursor?: string; limit?: number }): Promise<ListResult> {
    const listed = await this.bucket.list({
      prefix,
      cursor: opts?.cursor,
      limit:  opts?.limit ?? 1000,
    });
    return {
      objects:   listed.objects.map(o => ({ key: o.key, size: o.size })),
      truncated: listed.truncated,
      cursor:    listed.truncated ? listed.cursor : undefined,
    };
  }
}
