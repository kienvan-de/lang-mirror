import { tool } from "ai";
import { z } from "zod/v4";

const DESCRIPTION =
  "Open a topic's detail page to view its language versions, sentences, and tags.";

const SCHEMA = z.object({
  topicId: z.string().describe("The topic ID to open"),
});

export function openTopicDetailTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
  });
}
