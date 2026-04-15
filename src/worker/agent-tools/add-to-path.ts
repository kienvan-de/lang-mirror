import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

/**
 * Add a topic to the user's learning path.
 *
 * The agent should first use getMyPath to get the pathId, and
 * listMyTopics or getTopicDetail to get the topicId.
 */
export function addToPath({ user, paths }: Pick<ToolDeps, "user" | "paths">) {
  return tool({
    description:
      "Add a topic to the user's learning path. Use getMyPath first to get the path ID, and listMyTopics to find the topic ID.",
    inputSchema: z.object({
      pathId: z.string().describe("The learning path ID (from getMyPath)"),
      topicId: z.string().describe("The topic ID to add to the path"),
    }),
    execute: async ({ pathId, topicId }) =>
      runWithAuth(user, () => paths.addTopic(pathId, topicId)),
  });
}
