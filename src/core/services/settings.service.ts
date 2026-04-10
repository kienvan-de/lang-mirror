import type { IDatabase } from "../ports/db.port";
import type { SettingRow } from "../db/types";
import { getAuthContext, requireAuth, isAdmin } from "../auth/context";
import { NotFoundError, ValidationError, ForbiddenError } from "../errors";
import { SYSTEM_USER_ID } from "../db/schema";

// Keys that only admins can change at system level
const ADMIN_ONLY_SYSTEM_KEYS = new Set([
  "app.port",
  "app.browserOpen",
  "tts.global.speed",
  "tts.global.pitch",
]);

export class SettingsService {
  constructor(private db: IDatabase) {}

  /**
   * Get all settings as a merged key→value map.
   * User settings shadow system defaults (owner_id = SYSTEM_USER_ID).
   */
  async getAll(): Promise<Record<string, string>> {
    const ctx = getAuthContext();
    const ownerId = ctx.isAnonymous ? null : ctx.id;

    let rows: SettingRow[];
    if (ownerId) {
      // Merge: system defaults overridden by user's own settings
      rows = await this.db.queryAll<SettingRow>(`
        SELECT s.key, COALESCE(u.value, s.value) as value, s.updated_at, s.owner_id
        FROM settings s
        LEFT JOIN settings u ON u.key = s.key AND u.owner_id = ?
        WHERE s.owner_id = ?
      `, ownerId, SYSTEM_USER_ID);
    } else {
      rows = await this.db.queryAll<SettingRow>(
        "SELECT key, value, updated_at, owner_id FROM settings WHERE owner_id = ?",
        SYSTEM_USER_ID
      );
    }

    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  /** Get a single setting value (user override then system default). */
  async get(key: string): Promise<{ key: string; value: string }> {
    const ctx = getAuthContext();
    const ownerId = ctx.isAnonymous ? null : ctx.id;

    let row: { value: string } | null = null;

    if (ownerId) {
      // Try user-specific first
      row = await this.db.queryFirst<{ value: string }>(
        "SELECT value FROM settings WHERE key = ? AND owner_id = ?", key, ownerId
      );
    }

    if (!row) {
      // Fall back to system default
      row = await this.db.queryFirst<{ value: string }>(
        "SELECT value FROM settings WHERE key = ? AND owner_id = ?", key, SYSTEM_USER_ID
      );
    }

    if (!row) throw new NotFoundError(`Setting '${key}' not found`);
    return { key, value: row.value };
  }

  /** Set a user-specific setting (shadows the system default). */
  async set(key: string, value: string): Promise<{ key: string; value: string }> {
    if (value === undefined || value === null) throw new ValidationError("value is required", "value");
    const auth = requireAuth();

    await this.db.run(
      `INSERT INTO settings (key, owner_id, value) VALUES (?, ?, ?)
       ON CONFLICT(key, owner_id) DO UPDATE SET value = excluded.value,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      key, auth.id, String(value)
    );
    return { key, value: String(value) };
  }

  /** Set a system-level setting (owner_id = SYSTEM_USER_ID). Admin only for protected keys. */
  async setSystem(key: string, value: string): Promise<{ key: string; value: string }> {
    if (ADMIN_ONLY_SYSTEM_KEYS.has(key) && !isAdmin()) {
      throw new ForbiddenError(`Setting '${key}' can only be changed by admins`);
    }
    if (value === undefined || value === null) throw new ValidationError("value is required", "value");

    await this.db.run(
      `INSERT INTO settings (key, owner_id, value) VALUES (?, ?, ?)
       ON CONFLICT(key, owner_id) DO UPDATE SET value = excluded.value,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      key, SYSTEM_USER_ID, String(value)
    );
    return { key, value: String(value) };
  }

  /** Convenience: get a raw value with fallback (used internally by TTS service). */
  async getValue(key: string, fallback: string): Promise<string> {
    try {
      const result = await this.get(key);
      return result.value;
    } catch {
      return fallback;
    }
  }
}
