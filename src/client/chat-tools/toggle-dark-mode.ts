import type { AITool } from "@cloudflare/ai-chat/react";

export function toggleDarkMode(): AITool<
  Record<string, never>,
  { darkMode: boolean }
> {
  return {
    description: "Toggle between dark and light mode.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      document.documentElement.classList.toggle("dark");
      const isDark = document.documentElement.classList.contains("dark");
      return { darkMode: isDark };
    },
  };
}
