import type { AITool } from "@cloudflare/ai-chat/react";
import type { ClientToolDeps } from "./types";

export function startPractice({
  navigate,
  closeChat,
}: Pick<ClientToolDeps, "navigate" | "closeChat">): AITool<
  { topicId: string; langCode: string },
  { started: boolean; topicId: string; langCode: string }
> {
  return {
    description:
      "Open the practice view for a specific topic and language. Use getTopicDetail first to find available language codes.",
    parameters: {
      type: "object",
      properties: {
        topicId: {
          type: "string",
          description: "The topic ID",
        },
        langCode: {
          type: "string",
          description: "The language code to practice (e.g. 'en', 'ja', 'vi')",
        },
      },
      required: ["topicId", "langCode"],
    },
    execute: async ({ topicId, langCode }) => {
      closeChat();
      navigate({ to: `/practice/${topicId}/${langCode}` });
      return { started: true, topicId, langCode };
    },
  };
}
