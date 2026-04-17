import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Add a topic to the user's learning path. Use getMyPath first to get the path ID, and listMyTopics to find the topic ID.";

const SCHEMA = z.object({
  pathId: z.string().describe("The learning path ID (from getMyPath)"),
  topicId: z.string().describe("The topic ID to add to the path"),
});

export function addToPath({ user, paths }: Pick<ToolDeps, "user" | "paths">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ pathId, topicId }) => {
      await runWithAuth(user, () => paths.addTopic(pathId, topicId));
      return `✅ Added topic ${topicId} to learning path.`;
    },
  });
}
