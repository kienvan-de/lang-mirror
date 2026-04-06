import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";

export const DATA_DIR = join(homedir(), ".lang-mirror");
export const TTS_CACHE_DIR = join(DATA_DIR, "cache", "tts");
export const RECORDINGS_DIR = join(DATA_DIR, "recordings");

export function ensureDataDirs(): void {
  const dirs = [DATA_DIR, TTS_CACHE_DIR, RECORDINGS_DIR];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`✓ Created ${dir}`);
    }
  }
}

// Run immediately so that any module importing data-dir can rely on these dirs
// existing (e.g. db/client.ts which opens the SQLite file on import).
ensureDataDirs();
