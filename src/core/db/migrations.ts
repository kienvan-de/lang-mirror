import type { IDatabase } from "../ports/db.port";
import { DDL_STATEMENTS, DEFAULT_SETTINGS } from "./schema";

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

  // Seed system default settings (owner_id = NULL means system)
  for (const [key, value] of DEFAULT_SETTINGS) {
    await db.run(
      "INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES (?, NULL, ?)",
      key,
      value
    );
  }

  console.log("✓ Migrations complete");
}
