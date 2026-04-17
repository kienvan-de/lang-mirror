import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Update an existing sentence's text and/or notes. Use getTopicDetail first to find the sentence ID. Notes are translation hints keyed by language code.";

const SCHEMA = z.object({
  sentenceId: z.string().describe("The sentence ID to update"),
  text: z.string().max(2000).optional().describe("New sentence text (omit to keep current)"),
  notes: z
    .record(z.string(), z.string().max(4000))
    .optional()
    .describe(
      "New translation notes keyed by language code. Replaces all existing notes. e.g. { 'en': 'Hello', 'vi': 'Xin chào' }",
    ),
});

export function updateSentence({ user, sentences }: Pick<ToolDeps, "user" | "sentences">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ sentenceId, text, notes }) => {
      await runWithAuth(user, () => sentences.update(sentenceId, { text, notes }));
      return `✅ Updated sentence ${sentenceId}.`;
    },
  });
}
