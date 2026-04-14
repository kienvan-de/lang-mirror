import type { IDatabase } from "../../core/ports/db.port";

/**
 * Wraps Cloudflare D1Database to implement the async IDatabase interface.
 */
export class D1Adapter implements IDatabase {
  constructor(private db: D1Database) {}

  async queryAll<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(...params).all<T>();
    return result.results;
  }

  async queryFirst<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return this.db.prepare(sql).bind(...params).first<T>();
  }

  async run(sql: string, ...params: unknown[]): Promise<void> {
    await this.db.prepare(sql).bind(...params).run();
  }

  async batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
    await this.db.batch(
      statements.map(({ sql, params }) => this.db.prepare(sql).bind(...params))
    );
  }

  /**
   * Execute raw SQL without parameterised bindings.
   * ⚠️  ONLY safe for static DDL (migrations). NEVER pass user-supplied input.
   * All application queries must go through queryAll / queryFirst / run / batch
   * which use `.prepare().bind()` for parameterised execution.
   */
  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }
}
