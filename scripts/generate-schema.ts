/**
 * Generate migrations/0001_initial_schema.sql from src/core/db/schema.ts
 *
 * Usage:
 *   bun run cf:schema:gen
 *
 * Run this whenever src/core/db/schema.ts changes, then commit both files.
 * The generated SQL is used by: wrangler d1 migrations apply
 */

import { DDL_STATEMENTS, DEFAULT_SETTINGS, SYSTEM_USER_ID } from "../src/core/db/schema";
import { writeFileSync } from "fs";
import { join } from "path";

const OUTPUT = join(import.meta.dir, "../migrations/0001_initial_schema.sql");

const lines: string[] = [
  "-- !! AUTO-GENERATED — do not edit by hand.",
  "-- Source: src/core/db/schema.ts",
  "-- To regenerate: bun run cf:schema:gen",
  "",
];

// DDL statements
for (const stmt of DDL_STATEMENTS) {
  lines.push(stmt.trim() + ";");
  lines.push("");
}

// System user seed — owns all default settings, role 'readonly' = no privileges
lines.push("-- System user (owns default settings, cannot log in)");
lines.push(
  `INSERT OR IGNORE INTO users (id, oidc_provider_id, user_id, name, role) VALUES ('${SYSTEM_USER_ID}', NULL, '${SYSTEM_USER_ID}', 'System', 'readonly');`
);
lines.push("");

// Default settings seed
lines.push("-- Default system settings");
for (const [key, value] of DEFAULT_SETTINGS) {
  lines.push(
    `INSERT OR IGNORE INTO settings (key, owner_id, value) VALUES ('${key}', '${SYSTEM_USER_ID}', '${value}');`
  );
}
lines.push("");

const sql = lines.join("\n");
writeFileSync(OUTPUT, sql, "utf-8");
console.log(`✓ Generated ${OUTPUT}`);
console.log(`  ${DDL_STATEMENTS.length} DDL statements`);
console.log(`  ${DEFAULT_SETTINGS.length} default settings`);
