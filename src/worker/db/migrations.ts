import { D1Adapter } from "../adapters/db.adapter";
import { runMigrations } from "../../core/db/migrations";

/**
 * Apply schema migrations to the CF D1 database.
 * For local dev: called manually via `bun run cf:migrate`.
 * For production: wrangler d1 migrations apply lang-mirror-db --remote
 *
 * The shared runMigrations() uses IDatabase — works with both D1Adapter and BunSQLiteAdapter.
 */
export async function runD1Migrations(db: D1Database): Promise<void> {
  const adapter = new D1Adapter(db);
  await runMigrations(adapter);
}
