import { Database } from "bun:sqlite";
import { join } from "path";
// Importing data-dir triggers ensureDataDirs() as a side-effect,
// guaranteeing ~/.lang-mirror/ exists before we open the DB file.
import { DATA_DIR } from "../lib/data-dir";

const DB_PATH = join(DATA_DIR, "db.sqlite");

// NOTE: ensureDataDirs() must be called before this module is imported.
// src/server/index.ts does this at the top before importing db.
export const db = new Database(DB_PATH, { create: true });

// Enable WAL mode for better concurrent read performance
db.run("PRAGMA journal_mode = WAL");
// Enforce foreign key constraints
db.run("PRAGMA foreign_keys = ON");
