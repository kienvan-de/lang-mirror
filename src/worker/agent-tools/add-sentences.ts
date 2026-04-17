import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Add sentences (text only, no notes) to an existing language version. " +
  "Use getTopicDetail first to find the version ID. " +
  "After adding, use updateSentence to add translation notes per sentence.";

const SCHEMA = z.object({
  versionId: z.string().describe("The language version ID to add sentences to"),
  sentences: z
    .array(z.string().max(2000).describe("Sentence text"))
    .min(1)
    .max(50)
    .describe("Sentence texts to add (max 50 per call)"),
});

export function addSentences({ user, versions }: Pick<ToolDeps, "user" | "versions">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ versionId, sentences }) => {
      const created = await runWithAuth(user, async () => {
        const results = [];
        for (const text of sentences) {
          const s = await versions.createSentence(versionId, { text });
          results.push(s);
        }
        return results;
      });
      // Return IDs so the LLM can call updateSentence with notes
      const ids = created.map((s) => s.id);
      return `✅ Added ${sentences.length} sentence(s). IDs: ${ids.join(", ")}`;
    },
  });
}
