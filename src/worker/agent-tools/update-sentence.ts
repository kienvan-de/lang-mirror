import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Update a sentence's text and/or translation notes. Use the sentence ID from addSentences or getTopicDetail. " +
  "Notes are keyed by language code (e.g. { \"en\": \"Hello!\", \"vi\": \"Xin chào!\" }). " +
  "Call once per sentence — keep each call small.";

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
