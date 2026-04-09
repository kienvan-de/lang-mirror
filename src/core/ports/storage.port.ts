/**
 * Platform-agnostic object storage interface.
 *
 * Implemented by:
 *   - FilesystemAdapter  (src/server/adapters/storage.adapter.ts)  — local disk (~/.lang-mirror/)
 *   - R2Adapter          (src/worker/adapters/storage.adapter.ts)  — Cloudflare R2
 */

export interface StoredObject {
  /** Streaming body — pipe directly into a Response */
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface IObjectStorage {
  /** Returns null if the key does not exist */
  get(key: string): Promise<StoredObject | null>;

  /** Create or overwrite an object */
  put(
    key: string,
    data: ArrayBuffer | ReadableStream<Uint8Array>,
    opts?: { contentType?: string }
  ): Promise<void>;

  /** Delete an object — no-op if key does not exist */
  delete(key: string): Promise<void>;

  /** List objects, optionally filtered by key prefix */
  list(prefix?: string): Promise<Array<{ key: string; size: number }>>;
}
