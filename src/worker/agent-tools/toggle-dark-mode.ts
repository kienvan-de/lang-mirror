import { tool } from "ai";
import { z } from "zod/v4";

const DESCRIPTION = "Toggle between dark and light mode in the app.";

const SCHEMA = z.object({});

export function toggleDarkModeTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
  });
}
