import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import type { IObjectStorage, StoredObject } from "../../core/ports/storage.port";

/**
 * Filesystem-based object storage adapter for the desktop (Bun) server.
 * Keys are relative paths under the base directory.
 *
 * Storage layout:
 *   baseDir/
 *   ├── tts/{hash}.mp3              ← TTS audio cache
 *   └── recordings/{topicId}/{lang}/sentence-{id}.webm
 */
export class FilesystemAdapter implements IObjectStorage {
  constructor(private baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
  }

  private fullPath(key: string): string {
    return join(this.baseDir, key);
  }

  async get(key: string): Promise<StoredObject | null> {
    const path = this.fullPath(key);
    if (!existsSync(path)) return null;

    const buffer = readFileSync(path);
    const size = buffer.byteLength;
    const contentType = key.endsWith(".mp3")  ? "audio/mpeg"
                      : key.endsWith(".webm") ? "audio/webm"
                      : key.endsWith(".ogg")  ? "audio/ogg"
                      : "application/octet-stream";

    // Wrap Buffer in a ReadableStream
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });

    return { body, contentType, size };
  }

  async put(
    key: string,
    data: ArrayBuffer | ReadableStream<Uint8Array>,
    opts?: { contentType?: string }
  ): Promise<void> {
    const path = this.fullPath(key);
    mkdirSync(dirname(path), { recursive: true });

    if (data instanceof ArrayBuffer) {
      writeFileSync(path, new Uint8Array(data));
    } else {
      // Consume the ReadableStream and write to disk
      const chunks: Uint8Array[] = [];
      const reader = (data as ReadableStream<Uint8Array>).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      writeFileSync(path, out);
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.fullPath(key);
    if (existsSync(path)) unlinkSync(path);
  }

  async list(prefix = ""): Promise<Array<{ key: string; size: number }>> {
    const baseWithPrefix = this.fullPath(prefix);
    if (!existsSync(baseWithPrefix)) return [];

    const results: Array<{ key: string; size: number }> = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const key = full.slice(this.baseDir.length + 1).replace(/\\/g, "/");
          if (key.startsWith(prefix)) {
            try { results.push({ key, size: statSync(full).size }); } catch { /* skip */ }
          }
        }
      }
    };

    walk(existsSync(baseWithPrefix) && statSync(baseWithPrefix).isDirectory()
      ? baseWithPrefix
      : this.fullPath(""));

    return results.filter(r => r.key.startsWith(prefix));
  }
}
