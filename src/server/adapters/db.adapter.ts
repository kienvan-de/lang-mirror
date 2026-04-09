import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { IDatabase } from "../../core/ports/db.port";

/**
 * Wraps bun:sqlite (synchronous) to implement the async IDatabase interface.
 * All methods resolve immediately — no actual async I/O — but the async
 * signature unifies the API with D1Adapter.
 */
export class BunSQLiteAdapter implements IDatabase {
  constructor(private db: Database) {}

  async queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params as SQLQueryBindings[]) as T[];
  }

  async queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...params as SQLQueryBindings[]) as T | undefined) ?? null;
  }

  async run(sql: string, ...params: unknown[]): Promise<void> {
    this.db.prepare(sql).run(...params as SQLQueryBindings[]);
  }

  async batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
    const tx = this.db.transaction(() => {
      for (const { sql, params } of statements) {
        this.db.prepare(sql).run(...params as SQLQueryBindings[]);
      }
    });
    tx();
  }

  async exec(sql: string): Promise<void> {
    this.db.run(sql);
  }
}
