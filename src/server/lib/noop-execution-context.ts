import type { IExecutionContext } from "../../core/ports/execution.port";

/**
 * No-op implementation of IExecutionContext for the Bun desktop server.
 * waitUntil() is unnecessary here — the process stays alive for the
 * entire server lifetime, so background promises complete naturally.
 */
export class NoopExecutionContext implements IExecutionContext {
  waitUntil(promise: Promise<unknown>): void {
    // Intentionally no-op — the promise will still run to completion
    // on the long-lived Bun process without any special lifetime extension.
    void promise;
  }
}

export const noopCtx = new NoopExecutionContext();
