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
import { streamText, stepCountIs, convertToModelMessages } from "ai";
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
} from "./agent-config/prompt";
import type { Env } from "./types";
import type { Connection, ConnectionContext } from "agents";

export class ChatAgent extends AIChatAgent<Env> {

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

    const modelMessages = await convertToModelMessages(this.messages);

    const result = streamText({
      model: workersai(modelName),
      system: buildSystemPrompt(assistantName, nativeLanguage, learningLanguages),
      messages: modelMessages,
      tools: agentTools,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
      onFinish: onFinish as never,
    });

    return result.toUIMessageStreamResponse();
  }
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

