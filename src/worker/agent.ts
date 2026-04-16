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
import { AIChatAgent, createToolsFromClientSchemas } from "@cloudflare/ai-chat";
import { streamText, convertToModelMessages } from "ai";
import type { ModelMessage, UIMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { runWithAuth } from "../core/auth/context";
import type { AuthUser } from "../core/auth/context";
import { buildContext } from "./lib/context";
import { buildAgentTools } from "./agent-tools/index";
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

export class ChatAgent extends AIChatAgent<Env> {

  /**
   * Limit persisted messages to prevent unbounded SQLite growth.
   * AIChatAgent deletes oldest messages when this limit is exceeded.
   */
  maxPersistedMessages = 100;

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
    console.log("[ChatAgent] onConnect", { url: ctx.request.url });

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
    console.log("[ChatAgent] onChatMessage called", {
      messageCount: this.messages.length,
      hasBody: !!options?.body,
      pageContext: options?.body?.pageContext
        ? (options.body.pageContext as { page: string }).page
        : "none",
      continuation: options?.continuation,
    });

    // Always load from SQLite — safe after hibernation
    const user = this.loadUser();
    if (!user) {
      console.error("[ChatAgent] No user context in SQLite");
      throw new Error("Unauthorized — no user context");
    }

    console.log("[ChatAgent] User loaded:", { id: user.id, role: user.role });

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

    console.log("[ChatAgent] Settings:", { modelName, assistantName, nativeLangCode });

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

    // Filter out messages with incomplete tool calls before conversion.
    // The AI SDK validates that every tool call has a matching tool result.
    // Stale messages from failed/cancelled tool calls can cause
    // AI_MissingToolResultsError. We strip those to keep the history clean.
    const cleanMessages = stripIncompleteToolCalls(this.messages);
    const allMessages = await convertToModelMessages(cleanMessages);
    const modelMessages = slidingWindow(allMessages, MAX_HISTORY_TOKENS);

    console.log("[ChatAgent] Sending to LLM:", {
      model: modelName,
      systemPromptLength: buildSystemPrompt(assistantName, nativeLanguage, learningLanguages, pageContext).length,
      messageCount: modelMessages.length,
      totalMessages: allMessages.length,
      toolCount: Object.keys(agentTools).length,
    });

    // Merge server tools with client tools (navigate, refresh, etc.)
    // Client tool schemas arrive via options.clientTools from useAgentChat.
    // createToolsFromClientSchemas converts them to AI SDK tools without
    // execute functions — when the LLM calls them, the DO sends the call
    // back to the client over WebSocket for browser-side execution.
    const clientTools = createToolsFromClientSchemas(options?.clientTools);
    const allTools = { ...agentTools, ...clientTools };

    console.log("[ChatAgent] Tools:", {
      serverTools: Object.keys(agentTools),
      clientTools: Object.keys(clientTools),
      totalTools: Object.keys(allTools).length,
    });

    const result = streamText({
      model: workersai(modelName),
      system: buildSystemPrompt(assistantName, nativeLanguage, learningLanguages, pageContext),
      messages: modelMessages,
      tools: allTools,
      // Do NOT use stopWhen/maxSteps here. Client tools (navigateTo, etc.)
      // have no execute function on the server — the result comes back from
      // the browser via WebSocket. AIChatAgent handles this automatically:
      // it detects the client tool call, sends it to the browser, waits for
      // the result, then re-calls onChatMessage with continuation=true.
      // Using stopWhen would cause AI_MissingToolResultsError because
      // streamText tries to continue the loop without the client result.
      abortSignal: options?.abortSignal,
      onFinish: onFinish as never,
    });

    return result.toUIMessageStreamResponse();
  }
}

/**
 * Strip incomplete tool calls from UIMessage history.
 *
 * The AI SDK validates that every tool-call in assistant messages has a
 * matching tool-result in the subsequent messages. Incomplete tool calls
 * (from failed executions, cancelled requests, or client tools that never
 * returned) cause AI_MissingToolResultsError.
 *
 * This function collects all tool-call IDs that have results, then removes
 * any tool-call parts from assistant messages that don't have results.
 * If an assistant message ends up with no parts, it's removed entirely.
 */
function stripIncompleteToolCalls(messages: UIMessage[]): UIMessage[] {
  // Collect all tool-call IDs that have results
  const resolvedToolCallIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (
        "type" in part &&
        (part as { type: string }).type.startsWith("tool-") &&
        "state" in part
      ) {
        const state = (part as { state: string }).state;
        const toolCallId = (part as { toolCallId?: string }).toolCallId;
        if (
          toolCallId &&
          (state === "output-available" || state === "output-error" || state === "output-denied")
        ) {
          resolvedToolCallIds.add(toolCallId);
        }
      }
    }
  }

  return messages
    .map((msg) => {
      if (msg.role !== "assistant") return msg;

      const filteredParts = msg.parts.filter((part) => {
        if (
          "type" in part &&
          (part as { type: string }).type.startsWith("tool-") &&
          "toolCallId" in part
        ) {
          const toolCallId = (part as { toolCallId: string }).toolCallId;
          // Keep only tool parts that have been resolved
          return resolvedToolCallIds.has(toolCallId);
        }
        // Keep all non-tool parts (text, reasoning, etc.)
        return true;
      });

      if (filteredParts.length === 0) return null;
      return { ...msg, parts: filteredParts };
    })
    .filter((msg): msg is UIMessage => msg !== null);
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

