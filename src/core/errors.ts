/**
 * Domain error types thrown by core services.
 * HTTP adapters (server routes / Hono handlers) catch these and map to status codes:
 *   NotFoundError   → 404
 *   ConflictError   → 409
 *   ValidationError → 400
 */

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}
