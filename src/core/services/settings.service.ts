import type { IDatabase } from "../ports/db.port";
import type { SettingRow } from "../db/types";
import { NotFoundError, ValidationError } from "../errors";

export class SettingsService {
  constructor(private db: IDatabase) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.queryAll<SettingRow>("SELECT key, value FROM settings");
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  async get(key: string): Promise<{ key: string; value: string }> {
    const row = await this.db.queryFirst<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?", key
    );
    if (!row) throw new NotFoundError(`Setting '${key}' not found`);
    return { key, value: row.value };
  }

  async set(key: string, value: string): Promise<{ key: string; value: string }> {
    if (value === undefined || value === null) throw new ValidationError("value is required", "value");

    await this.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      key, String(value)
    );
    return { key, value: String(value) };
  }

  /** Helper used by TTS service to resolve voice/speed/pitch with fallback chain */
  async getValue(key: string, fallback: string): Promise<string> {
    const row = await this.db.queryFirst<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?", key
    );
    return row?.value ?? fallback;
  }
}
