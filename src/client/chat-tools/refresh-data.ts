import type { AITool } from "@cloudflare/ai-chat/react";
import type { ClientToolDeps } from "./types";

export function refreshData({
  queryClient,
}: Pick<ClientToolDeps, "queryClient">): AITool<
  Record<string, never>,
  { refreshed: boolean }
> {
  return {
    description:
      "Refresh all app data. Call this after any write tool (createTopic, addLanguageVersion, addSentences, updateSentence, addToPath) so the UI shows the updated content.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      await queryClient.invalidateQueries();
      return { refreshed: true };
    },
  };
}
