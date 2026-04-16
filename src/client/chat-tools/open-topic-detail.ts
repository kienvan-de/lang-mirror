import type { AITool } from "@cloudflare/ai-chat/react";
import type { ClientToolDeps } from "./types";

export function openTopicDetail({
  navigate,
  closeChat,
}: Pick<ClientToolDeps, "navigate" | "closeChat">): AITool<
  { topicId: string },
  { opened: string }
> {
  return {
    description:
      "Open a topic's detail page to view its language versions, sentences, and tags. Use after creating a topic to show it to the user.",
    parameters: {
      type: "object",
      properties: {
        topicId: {
          type: "string",
          description: "The topic ID to open",
        },
      },
      required: ["topicId"],
    },
    execute: async ({ topicId }) => {
      closeChat();
      navigate({ to: `/topics/${topicId}` });
      return { opened: topicId };
    },
  };
}
