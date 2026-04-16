import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get a language version's full detail including all sentences with their notes. " +
  "Use this instead of getTopicDetail when you only need one version's content, e.g. " +
  "to explain a sentence's grammar, show notes, or prepare an update.";

const SCHEMA = z.object({
  versionId: z.string().describe("The language version ID"),
});

export function getVersionDetail({
  user,
  versions,
}: Pick<ToolDeps, "user" | "versions">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async ({ versionId }) =>
      runWithAuth(user, () => versions.get(versionId)),
  });
}
