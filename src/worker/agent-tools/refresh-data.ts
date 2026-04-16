import { tool } from "ai";
import { z } from "zod/v4";

const DESCRIPTION =
  "Refresh app data to show latest changes. Call after any write operation (create topic, add version, etc.).";

const SCHEMA = z.object({});

export function refreshDataTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
  });
}
