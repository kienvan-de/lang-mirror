/**
 * Singleton adapter instances for the desktop server.
 * Import these in route handlers instead of importing db/fs directly.
 */
import { db } from "../db/client";
import { DATA_DIR, TTS_CACHE_DIR } from "./data-dir";
import { BunSQLiteAdapter } from "../adapters/db.adapter";
import { FilesystemAdapter } from "../adapters/storage.adapter";
import { NodeEdgeTTSAdapter } from "../adapters/tts.adapter";

export const dbAdapter      = new BunSQLiteAdapter(db);
export const storageAdapter = new FilesystemAdapter(DATA_DIR);
export const ttsAdapter     = new NodeEdgeTTSAdapter(TTS_CACHE_DIR);
