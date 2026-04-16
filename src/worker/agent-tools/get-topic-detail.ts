import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get full details of a topic including all language versions, sentences, and tags.";

const SCHEMA = z.object({
  id: z.string().describe("Topic ID"),
});

export function getTopicDetail({ user, topics }: Pick<ToolDeps, "user" | "topics">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ id }) => runWithAuth(user, () => topics.get(id)),
  });
}
