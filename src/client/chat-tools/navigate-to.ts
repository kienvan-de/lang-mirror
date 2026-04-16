import type { AITool } from "@cloudflare/ai-chat/react";
import type { ClientToolDeps } from "./types";

const ROUTES: Record<string, string> = {
  dashboard: "/",
  topics: "/topics",
  path: "/path",
  import: "/import",
  settings: "/settings",
};

export function navigateTo({
  navigate,
  closeChat,
}: Pick<ClientToolDeps, "navigate" | "closeChat">): AITool<
  { page: string },
  { navigated: string }
> {
  return {
    description:
      "Navigate to a page in the app. Available pages: dashboard, topics, path, import, settings.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(ROUTES),
          description: "The page to navigate to",
        },
      },
      required: ["page"],
    },
    execute: async ({ page }) => {
      const to = ROUTES[page];
      if (!to) return { navigated: "unknown", error: `Unknown page: ${page}` } as never;
      closeChat();
      navigate({ to });
      return { navigated: page };
    },
  };
}
