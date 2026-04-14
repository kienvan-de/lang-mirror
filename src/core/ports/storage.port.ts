/**
 * Platform-agnostic object storage interface.
 *
 * Implemented by:
 *   - R2Adapter  (src/worker/adapters/storage.adapter.ts)  — Cloudflare R2
 */

export interface StoredObject {
  /** Streaming body — pipe directly into a Response */
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface ListResult {
  objects: Array<{ key: string; size: number }>;
  /** true if there are more objects beyond this page */
  truncated: boolean;
  /** pass as cursor to the next list() call to get the next page */
  cursor?: string;
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

  /** Delete a single object — no-op if key does not exist */
  delete(key: string): Promise<void>;

  /** Delete multiple objects in one call — no-op for missing keys */
  deleteBatch(keys: string[]): Promise<void>;

  /**
   * List objects with optional prefix filter and pagination.
   * Use cursor from a previous response to fetch the next page.
   */
  list(prefix?: string, opts?: { cursor?: string; limit?: number }): Promise<ListResult>;
}
