import { tool } from "ai";
import { z } from "zod/v4";

const DESCRIPTION =
  "Open the practice view for a topic in a specific language. The user will start practicing sentences with TTS.";

const SCHEMA = z.object({
  topicId: z.string().describe("The topic ID to practice"),
  langCode: z.string().describe("BCP-47 language code of the version to practice"),
});

export function startPracticeTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
  });
}
