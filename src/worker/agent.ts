/**
 * AI Chat Agent — Durable Object backed by AIChatAgent.
 *
 * Each user gets their own DO instance (named by userId, rewritten by
 * routeAuthenticatedAgent). Conversation history is stored in the DO's
 * built-in SQLite — no D1 table needed.
 *
 * Auth: the wrapper (routeAgent.ts) resolves the user from the session
 * cookie and passes the AuthUser object via X-Agent-Auth header. The DO
 * trusts this header because it's set server-side and client-sent values
 * are stripped by the wrapper.
 *
 * Hibernation: the AuthUser is persisted in the DO's built-in SQLite
 * (cf_agent_auth table) on first connect, so it survives DO eviction.
 * On each onChatMessage call, we read from SQLite rather than relying
 * on in-memory state.
 */
import { AIChatAgent } from "@cloudflare/ai-chat";
import { streamText, convertToModelMessages } from "ai";
import type { ModelMessage, StepResult, ToolSet, StopCondition } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { runWithAuth } from "../core/auth/context";
import type { AuthUser } from "../core/auth/context";
import { buildContext } from "./lib/context";
import { buildAgentTools, STOP_AFTER_TOOL_NAMES } from "./agent-tools/index";
import {
  buildSystemPrompt,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL,
  type PageContext,
} from "./agent-config/prompt";
import type { Env } from "./types";
import type { Connection, ConnectionContext } from "agents";

/**
 * Rough token estimate: ~4 chars per token for mixed-language content.
 * Conservative — better to undercount and keep more headroom.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Maximum tokens for conversation history in the context window.
 * Workers AI models typically have 8,192 token context windows.
 * Reserve ~3,000 for system prompt (incl. page context + workflows)
 * and ~1,000 for the model's response.
 */
const MAX_HISTORY_TOKENS = 4000;

/**
 * Custom stop condition for the streamText multi-step loop.
 *
 * By default streamText stops after 1 step (stepCountIs(1)), which means
 * server-side read tools (getAppGuide, etc.) never get their results fed
 * back to the LLM for a text response.
 *
 * This condition allows looping for read/utility tools but stops immediately
 * when the last step called a write or client tool:
 *
 * - **Write tools** (createTopic, addSentences, etc.): the LLM already
 *   composed the content — a second inference to "summarize" the result
 *   wastes time and risks hitting the 30-second Worker wall-time limit
 *   (each Workers AI call takes 10-20s for complex tool calls).
 *
 * - **Client tools** (navigateTo, etc.): have no `execute` on the server.
 *   AIChatAgent handles the browser round-trip via auto-continuation.
 *
 * - **Read tools** (getAppGuide, getStreak, etc.): the loop continues so
 *   the LLM can read the tool result and generate a text response.
 *
 * Safety cap at 5 steps prevents runaway loops.
 */
const MAX_TOOL_STEPS = 5;

function stopAfterWriteOrClientTool(): StopCondition<ToolSet> {
  return ({ steps }: { steps: Array<StepResult<ToolSet>> }) => {
    if (steps.length >= MAX_TOOL_STEPS) return true;

    const lastStep = steps[steps.length - 1];
    if (!lastStep?.toolCalls?.length) return false;

    return lastStep.toolCalls.some((tc) => STOP_AFTER_TOOL_NAMES.has(tc.toolName));
  };
}

export class ChatAgent extends AIChatAgent<Env> {

  /**
   * Limit persisted messages to prevent unbounded SQLite growth.
   * AIChatAgent deletes oldest messages when this limit is exceeded.
   */
  maxPersistedMessages = 100;

  /**
   * Disable resumable stream chunk persistence.
   *
   * AIChatAgent stores every SSE token as a SQLite row in
   * cf_ai_chat_stream_chunks for stream resumption after disconnects.
   * A single response with ~200 tokens = ~200 INSERT statements,
   * which burns through the Durable Objects free tier (100k rows_written/day).
   *
   * For a small app (≤20 users) where stream resumption isn't critical,
   * we skip chunk persistence entirely. Messages are still persisted
   * normally after the stream completes.
   */
  // @ts-expect-error — overriding internal method
  _storeStreamChunk() {
    // no-op: skip per-token SQLite writes
  }
  // @ts-expect-error — overriding internal method
  _flushChunkBuffer() {
    // no-op: nothing to flush
  }

  // ── Auth persistence (survives hibernation) ──────────────

  /**
   * Persist AuthUser to DO's built-in SQLite.
   * Called once in onConnect, then updated on each reconnect.
   */
  private persistUser(user: AuthUser): void {
    this.sql`
      CREATE TABLE IF NOT EXISTS cf_agent_auth (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `;
    this.sql`
      INSERT OR REPLACE INTO cf_agent_auth (id, data)
      VALUES ('user', ${JSON.stringify(user)})
    `;
  }

  /**
   * Load AuthUser from DO's built-in SQLite.
   * Works after hibernation because SQLite is persistent.
   */
  private loadUser(): AuthUser | null {
    try {
      const rows = this.sql<{ data: string }>`
        SELECT data FROM cf_agent_auth WHERE id = 'user'
      `;
      if (rows.length === 0) return null;
      return JSON.parse(rows[0].data) as AuthUser;
    } catch {
      // Table doesn't exist yet (first message before any connect)
      return null;
    }
  }

  // ── WebSocket lifecycle ──────────────────────────────────

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    // Read AuthUser from trusted header (set by routeAuthenticatedAgent)
    const authHeader = ctx.request.headers.get("X-Agent-Auth");
    if (!authHeader) {
      connection.close(4001, "Unauthorized");
      return;
    }

    let user: AuthUser;
    try {
      user = JSON.parse(authHeader) as AuthUser;
    } catch {
      connection.close(4001, "Unauthorized");
      return;
    }

    // Persist to SQLite so it survives DO hibernation
    this.persistUser(user);
  }

  // ── Chat handler ─────────────────────────────────────────

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<Env>["onChatMessage"]>[1],
  ) {
    // Always load from SQLite — safe after hibernation
    const user = this.loadUser();
    if (!user) {
      throw new Error("Unauthorized — no user context");
    }

    const { topics, versions, sentences, practice, paths, settings, importer } =
      await buildContext(this.env);

    // Read configurable settings
    const [modelName, assistantName, nativeLangCode, learningLangsJson] =
      await runWithAuth(user, () =>
        Promise.all([
          settings.getValue("ai.model", DEFAULT_MODEL),
          settings.getValue("ai.assistant.name", DEFAULT_ASSISTANT_NAME),
          settings.getValue("user.nativeLanguage", "en"),
          settings.getValue("user.learningLanguages", "[]"),
        ]),
      );

    // Resolve language codes to human-readable names
    const nativeLanguage = resolveLanguageName(nativeLangCode);
    let learningLanguages: string[];
    try {
      const codes = JSON.parse(learningLangsJson) as string[];
      learningLanguages = codes.map(resolveLanguageName);
    } catch {
      learningLanguages = [];
    }

    const workersai = createWorkersAI({ binding: this.env.AI });

    const agentTools = buildAgentTools({
      user,
      topics,
      versions,
      sentences,
      practice,
      paths,
      settings,
      importer,
    });

    // Read page context from client body
    const pageContext = options?.body?.pageContext as PageContext | undefined;

    const allMessages = await convertToModelMessages(this.messages);
    const modelMessages = slidingWindow(allMessages, MAX_HISTORY_TOKENS);

    const result = streamText({
      model: workersai(modelName),
      system: buildSystemPrompt(assistantName, nativeLanguage, learningLanguages, pageContext),
      messages: modelMessages,
      tools: agentTools,
      // Multi-step tool loop with smart stopping.
      // - Read tools (getAppGuide, etc.): loop continues → LLM reads result, generates text.
      // - Write tools (createTopic, etc.): loop stops → avoids second inference that
      //   would exceed the 30-second Worker wall-time limit. Tool returns a confirmation
      //   string rendered directly by the ChatWidget.
      // - Client tools (navigateTo, etc.): loop stops → AIChatAgent handles the
      //   browser round-trip via auto-continuation.
      stopWhen: stopAfterWriteOrClientTool(),
      abortSignal: options?.abortSignal,
      onFinish: onFinish as never,
    });

    return result.toUIMessageStreamResponse();
  }
}

/**
 * Sliding window: keep the most recent messages that fit within the token budget.
 *
 * Walks backward from the latest message, estimating tokens by character count.
 * Always includes at least the last message (even if it exceeds the budget alone).
 * Preserves message ordering — slices from the front.
 *
 * This is a rough heuristic. A proper implementation would use a tokenizer,
 * but char-based estimation is sufficient for staying under the context limit.
 */
function slidingWindow(
  messages: ModelMessage[],
  maxTokens: number,
): ModelMessage[] {
  let tokenCount = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const chars = estimateMessageChars(msg);
    const tokens = Math.ceil(chars / CHARS_PER_TOKEN);

    if (tokenCount + tokens > maxTokens && cutIndex < messages.length) {
      // Would exceed budget — stop here, but always include at least one message
      break;
    }

    tokenCount += tokens;
    cutIndex = i;
  }

  return messages.slice(cutIndex);
}

/**
 * Estimate the character count of a ModelMessage.
 * Handles text content (string or structured parts) and tool calls/results.
 */
function estimateMessageChars(msg: ModelMessage): number {
  let chars = 0;

  if ("content" in msg) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof part.text === "string") {
          chars += part.text.length;
        } else if ("toolCallId" in part) {
          // Tool result — estimate from stringified result
          chars += JSON.stringify(part).length;
        } else {
          // Other part types (image, file, etc.)
          chars += 100; // rough estimate
        }
      }
    }
  }

  // Role + overhead
  chars += 20;

  return chars;
}

/**
 * Resolve a BCP-47 language code to a native display name.
 * e.g. "vi" → "Tiếng Việt", "ja" → "日本語", "en" → "English"
 *
 * Uses a static map for supported languages (Cloudflare Workers support
 * Intl.DisplayNames but with limited locale data). Falls back to
 * Intl.DisplayNames, then to the raw code.
 */
function resolveLanguageName(code: string): string {
  const NAMES: Record<string, string> = {
    en: "English",
    vi: "Tiếng Việt",
    ja: "日本語",
    de: "Deutsch",
    fr: "Français",
    zh: "中文",
    ko: "한국어",
    es: "Español",
    pt: "Português",
    it: "Italiano",
    ru: "Русский",
  };
  const base = code.split("-")[0]!.toLowerCase();
  return NAMES[base] ?? code;
}

