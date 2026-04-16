import { tool } from "ai";
import { z } from "zod/v4";
import { getGuideContent } from "../agent-config/guide";

const DESCRIPTION =
  "Get usage instructions and navigation guide for the Lang Mirror Today app. Use when the user asks how to do something, where to find a feature, or needs help navigating the app.";

const SCHEMA = z.object({
  topic: z
    .string()
    .optional()
    .describe(
      "Specific area to get help for: 'dashboard', 'topics', 'practice', 'path', 'import', 'settings', 'admin', or leave empty for full overview",
    ),
});

export function getAppGuide() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ topic }) => getGuideContent(topic),
  });
}
