import type { IObjectStorage, StoredObject } from "../../core/ports/storage.port";

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
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
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

  async list(prefix?: string): Promise<Array<{ key: string; size: number }>> {
    const listed = await this.bucket.list(prefix ? { prefix } : undefined);
    return listed.objects.map(obj => ({ key: obj.key, size: obj.size }));
  }
}
