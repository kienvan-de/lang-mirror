import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get a single sentence's full detail including text and all translation notes. " +
  "Use this when the user asks to explain, review, or discuss a specific sentence. " +
  "The sentence ID is available from the page context or from getTopicDetail/getVersionDetail.";

const SCHEMA = z.object({
  sentenceId: z.string().describe("The sentence ID"),
});

export function getSentenceDetail({
  user,
  sentences,
}: Pick<ToolDeps, "user" | "sentences">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ sentenceId }) =>
      runWithAuth(user, () => sentences.get(sentenceId)),
  });
}
