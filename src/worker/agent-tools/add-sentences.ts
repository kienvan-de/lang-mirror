import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Add one or more sentences to an existing language version. Use getTopicDetail first to find the version ID. Each version can have up to 500 sentences.";

const SCHEMA = z.object({
  versionId: z.string().describe("The language version ID to add sentences to"),
  sentences: z
    .array(
      z.object({
        text: z.string().max(2000).describe("Sentence text"),
        notes: z
          .record(z.string(), z.string().max(4000))
          .optional()
          .describe("Translation notes keyed by language code, e.g. { 'en': 'Hello' }"),
      }),
    )
    .min(1)
    .max(50)
    .describe("Sentences to add (max 50 per call)"),
});

export function addSentences({ user, versions }: Pick<ToolDeps, "user" | "versions">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ versionId, sentences }) => {
      await runWithAuth(user, async () => {
        for (const s of sentences) {
          await versions.createSentence(versionId, {
            text: s.text,
            notes: s.notes,
          });
        }
      });
      return `✅ Added ${sentences.length} sentence(s) to version ${versionId}.`;
    },
  });
}
