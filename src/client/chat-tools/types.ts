/**
 * Dependencies injected into client-side chat tools.
 *
 * These come from React hooks inside ChatWidget and are passed
 * as closures to each tool's execute function.
 */
import type { QueryClient } from "@tanstack/react-query";

export interface ClientToolDeps {
  /** TanStack Router navigate function */
  navigate: (opts: { to: string }) => void;
  /** TanStack Query client for cache invalidation */
  queryClient: QueryClient;
  /** Close the chat panel after navigation */
  closeChat: () => void;
}
