/**
 * Platform-agnostic database interface.
 *
 * Implemented by:
 *   - BunSQLiteAdapter  (src/server/adapters/db.adapter.ts)  — wraps bun:sqlite (sync → async)
 *   - D1Adapter         (src/worker/adapters/db.adapter.ts)  — wraps Cloudflare D1 (async)
 */
export interface IDatabase {
  /** Run a SELECT and return all matching rows */
  queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]>;

  /** Run a SELECT and return the first row, or null if no match */
  queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null>;

  /** Run an INSERT / UPDATE / DELETE */
  run(sql: string, ...params: unknown[]): Promise<void>;

  /**
   * Execute multiple statements atomically.
   * Desktop: uses bun:sqlite transaction.
   * CF Worker: uses D1 batch API.
   */
  batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void>;

  /**
   * Execute a raw DDL statement (CREATE TABLE, CREATE INDEX, etc.).
   * Used only by the migration runner — one statement at a time.
   */
  exec(sql: string): Promise<void>;
}
