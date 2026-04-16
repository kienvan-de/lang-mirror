/**
 * Floating AI chat widget — visible on most authenticated pages.
 *
 * Desktop: 360×520px floating panel, bottom-right corner.
 * Mobile (<640px): full-screen overlay.
 *
 * Hidden on: /settings, /admin/*, /login, /deactivated, /privacy, /onboarding.
 *
 * Auth: useAgent connects via WebSocket to /agents/chat-agent/default.
 * The server wrapper (routeAuthenticatedAgent) rewrites "default" to the
 * authenticated userId using the HttpOnly session cookie — the client
 * never sends any identity info.
 */
import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import ReactMarkdown from "react-markdown";
import { buildClientTools } from "../chat-tools";
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/outline";

/** Routes where the chat widget should be hidden */
const HIDDEN_PATHS = new Set([
  "/settings",
  "/login",
  "/deactivated",
  "/privacy",
  "/onboarding",
]);

function isHiddenRoute(pathname: string): boolean {
  if (HIDDEN_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export function ChatWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const closeChat = useCallback(() => setOpen(false), []);

  const clientTools = buildClientTools({ navigate, queryClient, closeChat });

  const agent = useAgent({
    agent: "ChatAgent",
    // No name — server rewrites "default" to userId
  });

  const { messages, sendMessage, stop, status, isStreaming } = useAgentChat({
    agent,
    tools: clientTools,
  });

  const isLoading = status === "streaming" || status === "submitted" || isStreaming;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  };

  // Hide on excluded routes
  if (isHiddenRoute(location.pathname)) return null;

  return (
    <>
      {/* ── Toggle Button (hidden when panel is open) ──────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="
            fixed bottom-6 right-6 z-[9999]
            w-13 h-13 rounded-full
            bg-orange-500 hover:bg-orange-600
            text-white shadow-lg hover:shadow-xl
            transition-all duration-200
            flex items-center justify-center
            cursor-pointer
          "
          aria-label={t("chat.open")}
        >
          <ChatBubbleLeftRightIcon className="w-6 h-6" />
        </button>
      )}

      {/* ── Chat Panel ─────────────────────────────────────── */}
      {open && (
        <div
          className="
            fixed z-[9998]
            bg-white dark:bg-gray-900
            border border-gray-200 dark:border-gray-700
            shadow-2xl
            flex flex-col overflow-hidden
            /* Mobile: full screen */
            inset-0
            /* Desktop: floating panel */
            sm:inset-auto sm:bottom-6 sm:right-6
            sm:w-[360px] sm:h-[520px] sm:rounded-2xl
          "
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-orange-500" />
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex-1">
              {t("chat.title")}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label={t("chat.close")}
            >
              <XMarkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("chat.emptyHint")}
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`
                    max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed
                    ${
                      m.role === "user"
                        ? "bg-orange-500 text-white rounded-br-sm"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
                    }
                  `}
                >
                  {m.role === "user" ? (
                    // User messages: plain text
                    m.parts
                      .filter(
                        (p): p is Extract<typeof p, { type: "text" }> =>
                          p.type === "text",
                      )
                      .map((p, i) => (
                        <span key={i} className="whitespace-pre-wrap">
                          {p.text}
                        </span>
                      ))
                  ) : (
                    // Assistant messages: render as markdown
                    <div className="prose prose-sm dark:prose-invert max-w-none
                      prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                      prose-headings:my-2 prose-pre:my-2 prose-code:text-xs
                      prose-a:text-orange-600 dark:prose-a:text-orange-400">
                      {m.parts
                        .filter(
                          (p): p is Extract<typeof p, { type: "text" }> =>
                            p.type === "text",
                        )
                        .map((p, i) => (
                          <ReactMarkdown key={i}>{p.text}</ReactMarkdown>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.placeholder")}
              className="
                flex-1 px-3 py-2 rounded-lg text-sm
                bg-white dark:bg-gray-800
                border border-gray-300 dark:border-gray-600
                text-gray-900 dark:text-gray-100
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500
                disabled:opacity-50
              "
              disabled={isLoading}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="
                  p-2 rounded-lg
                  bg-red-500 hover:bg-red-600
                  text-white
                  transition-colors cursor-pointer
                  flex items-center justify-center
                "
                aria-label={t("chat.stop")}
              >
                <StopIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="
                  p-2 rounded-lg
                  bg-orange-500 hover:bg-orange-600
                  text-white
                  transition-colors cursor-pointer
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center
                "
                aria-label={t("chat.send")}
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
