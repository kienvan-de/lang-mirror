import type { IDatabase } from "../ports/db.port";
import { DDL_STATEMENTS, DEFAULT_SETTINGS, DEFAULT_TAGS, SYSTEM_USER_ID } from "./schema";

/**
 * Adapter-agnostic migration runner.
 * Fully idempotent — safe to run on every startup.
 *
 * Used by:
 *   - src/server/db/migrations.ts  (desktop, via BunSQLiteAdapter)
 *   - src/worker/db/migrations.ts  (CF Worker, via D1Adapter)
 *
 * Note: For CF Workers the wrangler migration system
 * (migrations/0001_initial_schema.sql) is the authoritative DDL runner.
 * This function is kept for desktop startup and local dev convenience.
 */
export async function runMigrations(db: IDatabase): Promise<void> {
  for (const stmt of DDL_STATEMENTS) {
    await db.exec(stmt);
  }

  // Seed system user — owns all default settings, role 'readonly' = no privileges
  await db.run(
    `INSERT OR IGNORE INTO users (id, oidc_provider_id, user_id, name, role)
     VALUES (?, NULL, ?, 'System', 'readonly')`,
    SYSTEM_USER_ID,
    SYSTEM_USER_ID
  );

  // Seed system default settings under the system user
  for (const [key, value] of DEFAULT_SETTINGS) {
    await db.run(
      "INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES (?, ?, ?)",
      key,
      SYSTEM_USER_ID,
      value
    );
  }

  // Seed default tags under system user
  for (const tag of DEFAULT_TAGS) {
    await db.run(
      `INSERT OR IGNORE INTO tags (type, name, color, created_by) VALUES (?, ?, ?, ?)`,
      tag.type, tag.name, tag.color, SYSTEM_USER_ID
    );
  }

  console.log("✓ Migrations complete");
}
