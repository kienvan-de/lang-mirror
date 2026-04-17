import { tool } from "ai";
import { z } from "zod/v4";

/**
 * Client-side tool — no `execute`.
 *
 * The LLM generates the full topic JSON as tool arguments, which stream
 * incrementally to the browser via WebSocket. The browser's onToolCall
 * handler posts the payload to /api/import, then feeds the result back
 * via addToolOutput. AIChatAgent's auto-continuation then gives the LLM
 * a chance to respond.
 *
 * This avoids the 30-second Worker wall-time limit: structured output
 * generation (which can take 15-25s for a multi-language topic) streams
 * to the client instead of blocking a single DO request.
 */

const DESCRIPTION = `Create a new topic with full content: multiple language versions, sentences with optional notes, and tags.

Example input:
{
  "title": "Greetings",
  "description": "Common greeting phrases",
  "versions": [
    {
      "language": "en",
      "sentences": [
        { "text": "Hello, how are you?", "notes": { "vi": "Xin chào, bạn khỏe không?" } },
        { "text": "Good morning!", "notes": { "vi": "Chào buổi sáng!" } }
      ]
    },
    {
      "language": "vi",
      "sentences": [
        { "text": "Xin chào, bạn khỏe không?", "notes": { "en": "Hello, how are you?" } },
        { "text": "Chào buổi sáng!", "notes": { "en": "Good morning!" } }
      ]
    }
  ],
  "tags": ["A1", "conversation"]
}`;

const SCHEMA = z.object({
  title: z.string().max(200).describe("Topic title"),
  description: z.string().max(500).optional().describe("Topic description"),
  versions: z
    .array(
      z.object({
        language: z
          .string()
          .max(10)
          .describe("BCP-47 language code, e.g. 'en', 'ja', 'vi', 'de'"),
        title: z.string().max(200).optional().describe("Version-specific title override"),
        description: z.string().max(500).optional().describe("Version-specific description"),
        sentences: z
          .array(
            z.object({
              text: z.string().max(2000).describe("Sentence text"),
              notes: z
                .record(z.string(), z.string().max(4000))
                .optional()
                .describe("Translation notes keyed by language code, e.g. { 'en': 'Hello' }"),
            }),
          )
          .min(1)
          .max(500)
          .describe("Sentences for this language version"),
      }),
    )
    .min(1)
    .max(20)
    .describe("Language versions — each contains sentences in one language"),
  tags: z
    .array(z.string().max(100))
    .max(20)
    .optional()
    .describe("Tag names to attach (must exist in the system, e.g. 'A1', 'conversation', 'en')"),
});

export function createTopic() {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    // No execute — handled client-side in ChatWidget.onToolCall
  });
}
