/**
 * Platform-agnostic database interface.
 *
 * Implemented by:
 *   - D1Adapter  (src/worker/adapters/db.adapter.ts)  — wraps Cloudflare D1
 */
export interface IDatabase {
  /** Run a SELECT and return all matching rows */
  queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]>;

  /** Run a SELECT and return the first row, or null if no match */
  queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null>;

  /** Run an INSERT / UPDATE / DELETE */
  run(sql: string, ...params: unknown[]): Promise<void>;

  /**
   * Execute multiple statements atomically using D1 batch API.
   */
  batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void>;

  /**
   * Execute a raw DDL statement (CREATE TABLE, CREATE INDEX, etc.).
   * Used only by the migration runner — one statement at a time.
   */
  exec(sql: string): Promise<void>;
}
