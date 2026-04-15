import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

export function listMyTopics({ user, topics }: Pick<ToolDeps, "user" | "topics">) {
  return tool({
    description:
      "List the user's topics. Supports optional text search and pagination.",
    inputSchema: z.object({
      q: z.string().optional().describe("Search query to filter topics by title"),
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 20, max 100)"),
    }),
    execute: async ({ q, page, limit }) =>
      runWithAuth(user, () => topics.list({ q, page, limit })),
  });
}
