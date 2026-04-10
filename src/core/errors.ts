export class NotFoundError extends Error {
  constructor(message: string) { super(message); this.name = "NotFoundError"; }
}

export class ConflictError extends Error {
  constructor(message: string) { super(message); this.name = "ConflictError"; }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message); this.name = "ValidationError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message); this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message); this.name = "ForbiddenError";
  }
}
