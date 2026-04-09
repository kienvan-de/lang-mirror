import { db } from "./client";
import { BunSQLiteAdapter } from "../adapters/db.adapter";
import { runMigrations } from "../../core/db/migrations";

export function runMigrations_desktop(): void {
  const adapter = new BunSQLiteAdapter(db);
  // runMigrations is async but bun:sqlite is sync — safe to fire-and-forget at startup
  runMigrations(adapter).catch(err => {
    console.error("Migration error:", err);
    process.exit(1);
  });
}
