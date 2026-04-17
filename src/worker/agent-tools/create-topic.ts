import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Create an empty topic with title, description, and tags. " +
  "After creation, use addLanguageVersion + addSentences to populate content.";

const SCHEMA = z.object({
  title: z.string().max(200).describe("Topic title"),
  description: z.string().max(500).optional().describe("Topic description"),
  tags: z
    .array(z.string().max(100))
    .max(20)
    .optional()
    .describe("Tag names to attach (e.g. 'A1', 'conversation')"),
});

export function createTopic({ user, importer }: Pick<ToolDeps, "user" | "importer">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ title, description, tags }) => {
      const result = await runWithAuth(user, () =>
        importer.importLesson(
          {
            format: "topic",
            title,
            description,
            versions: [],
            tags,
          },
          null,
          "error",
        ),
      );
      return `✅ Created topic "${result.topic.title}" (ID: ${result.topic.id}). Now add language versions and sentences.`;
    },
  });
}
