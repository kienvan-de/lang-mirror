import type { IDatabase } from "../ports/db.port";
import type { SettingRow } from "../db/types";
import { getAuthContext, requireAuth, isAdmin } from "../auth/context";
import { NotFoundError, ValidationError, ForbiddenError } from "../errors";
import { SYSTEM_USER_ID } from "../db/schema";



/**
 * Allowlist of keys that regular (non-admin) users may set.
 * System-level keys (tts.edgeTTS.*, etc.) are only writable via setSystem().
 */
const USER_SETTABLE_KEYS = new Set([
  "privacy.uploadRecordings",
  "tts.global.speed",
  "tts.global.pitch",
  "tts.voices",
  "practice.mode",
  "practice.recordingMultiplier",
  "practice.drillPause",
  "practice.autoPlayback",
  "user.nativeLanguage",
  "user.learningLanguages",
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

    const map: Record<string, string> = {};

    if (ownerId) {
      // 1. System defaults as baseline
      const systemRows = await this.db.queryAll<SettingRow>(
        "SELECT key, value FROM settings WHERE owner_id = ?", SYSTEM_USER_ID
      );
      for (const r of systemRows) map[r.key] = r.value;

      // 2. User-specific settings override system defaults AND include user-only keys
      const userRows = await this.db.queryAll<SettingRow>(
        "SELECT key, value FROM settings WHERE owner_id = ?", ownerId
      );
      for (const r of userRows) map[r.key] = r.value;
    } else {
      const rows = await this.db.queryAll<SettingRow>(
        "SELECT key, value FROM settings WHERE owner_id = ?", SYSTEM_USER_ID
      );
      for (const r of rows) map[r.key] = r.value;
    }

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

    // Admins can write any key; regular users are restricted to the allowlist.
    if (!isAdmin() && !USER_SETTABLE_KEYS.has(key)) {
      throw new ForbiddenError(`Setting '${key}' is not user-configurable`);
    }

    await this.db.run(
      `INSERT INTO settings (key, owner_id, value) VALUES (?, ?, ?)
       ON CONFLICT(key, owner_id) DO UPDATE SET value = excluded.value,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      key, auth.id, String(value)
    );
    return { key, value: String(value) };
  }

  /** Set a system-level setting (owner_id = SYSTEM_USER_ID). Admin only. */
  async setSystem(key: string, value: string): Promise<{ key: string; value: string }> {
    if (!isAdmin()) {
      throw new ForbiddenError("Only admins can change system settings");
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

  /**
   * Resolve Edge TTS protocol constants from system settings.
   * Falls back to hardcoded defaults if the DB keys are missing (e.g. before
   * first migration run). Update the DB keys to rotate without a redeploy.
   */
  async getEdgeTTSConfig(): Promise<EdgeTTSConfig> {
    const [token, chromiumVersion, origin] = await Promise.all([
      this.getValue("tts.edgeTTS.trustedClientToken", "6A5AA1D4EAFF4E9FB37E23D68491D6F4"),
      this.getValue("tts.edgeTTS.chromiumVersion",    "143.0.3650.75"),
      this.getValue("tts.edgeTTS.origin",             "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"),
    ]);
    return { token, chromiumVersion, origin };
  }
}

// ── Edge TTS config type — exported for use by adapters ───────────────────────

export interface EdgeTTSConfig {
  /** TRUSTED_CLIENT_TOKEN — used in Sec-MS-GEC hash + WSS URL query param */
  token: string;
  /** Full Chromium version e.g. "143.0.3650.75" — drives User-Agent + SEC_MS_GEC_VERSION */
  chromiumVersion: string;
  /** WebSocket upgrade Origin header — must match Microsoft's allowlist */
  origin: string;
}
