import { tool } from "ai";
import { z } from "zod/v4";

const DESCRIPTION =
  "Navigate to a page in the app. Use when the user asks to go to a specific page.";

const SCHEMA = z.object({
  page: z
    .enum(["dashboard", "topics", "path", "import", "settings"])
    .describe("The page to navigate to"),
});

/**
 * Server-defined tool with no execute — handled client-side via onToolCall.
 * When the LLM calls this, the tool call is sent to the browser for execution.
 */
export function navigateToTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
  });
}
