/**
 * Platform-agnostic execution context interface.
 *
 * Implemented by:
 *   - CF Workers ExecutionContext  (c.executionCtx in Hono)
 *
 * Abstracts waitUntil() so core services can schedule background work
 * (e.g. writing to R2 cache in parallel with streaming a TTS response)
 * without importing CF-specific types into the core module.
 */
export interface IExecutionContext {
  /**
   * Extends the Worker's lifetime until the given promise settles.
   */
  waitUntil(promise: Promise<unknown>): void;
}
