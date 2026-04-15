import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

export function getTopicDetail({ user, topics }: Pick<ToolDeps, "user" | "topics">) {
  return tool({
    description:
      "Get full details of a topic including all language versions, sentences, and tags.",
    inputSchema: z.object({
      id: z.string().describe("Topic ID"),
    }),
    execute: async ({ id }) => runWithAuth(user, () => topics.get(id)),
  });
}
