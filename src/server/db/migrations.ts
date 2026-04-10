import { db } from "./client";
import { BunSQLiteAdapter } from "../adapters/db.adapter";
import { runMigrations } from "../../core/db/migrations";
import { seedDesktopData } from "./seed";

/**
 * Run schema migrations + desktop seed data on startup.
 * Shared schema DDL lives in src/core/db/migrations.ts.
 * Desktop-specific seed (mock OIDC provider + admin user) lives in seed.ts.
 */
export function runMigrations_desktop(): void {
  const adapter = new BunSQLiteAdapter(db);
  runMigrations(adapter)
    .then(() => seedDesktopData(adapter))
    .catch(err => {
      console.error("Migration/seed error:", err);
      process.exit(1);
    });
}
