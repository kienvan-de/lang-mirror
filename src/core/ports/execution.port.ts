/**
 * Platform-agnostic execution context interface.
 *
 * Implemented by:
 *   - CF Workers ExecutionContext  (c.executionCtx in Hono)
 *   - NoopExecutionContext         (src/server/lib/noop-execution-context.ts) — Bun desktop server
 *
 * Abstracts waitUntil() so core services can schedule background work
 * (e.g. writing to R2 in parallel with streaming a response)
 * without importing CF-specific types into the core module.
 */
export interface IExecutionContext {
  /**
   * Extends the Worker's lifetime until the given promise settles.
   * On the desktop server this is a no-op — the process stays alive anyway.
   */
  waitUntil(promise: Promise<unknown>): void;
}
