import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Add a new language version to an existing topic. Use getTopicDetail first to check which languages already exist. Each topic can have up to 20 language versions.";

const SCHEMA = z.object({
  topicId: z.string().describe("The topic ID to add a language version to"),
  language: z
    .string()
    .max(10)
    .describe("BCP-47 language code, e.g. 'en', 'ja', 'vi', 'de'"),
  title: z.string().max(200).optional().describe("Version-specific title override"),
  description: z.string().max(500).optional().describe("Version-specific description"),
});

export function addLanguageVersion({ user, versions }: Pick<ToolDeps, "user" | "versions">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ topicId, language, title, description }) =>
      runWithAuth(user, () =>
        versions.create(topicId, {
          language_code: language,
          title,
          description,
        }),
      ),
  });
}
