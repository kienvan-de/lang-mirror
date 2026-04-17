/**
 * Floating AI chat widget — visible on most authenticated pages.
 *
 * Desktop: 440×640px floating panel, bottom-right corner.
 * Mobile (<640px): full-screen overlay.
 *
 * Hidden on: /settings, /admin/*, /login, /deactivated, /privacy, /onboarding.
 *
 * Mobile keyboard strategy (Gemini-style):
 *   - The chat panel covers the full screen and does NOT resize with the keyboard.
 *   - The input bar is a SEPARATE fixed element rendered outside the panel.
 *   - It tracks window.visualViewport to always float just above the keyboard.
 *   - Messages area gets padding-bottom = input bar height so last msg stays visible.
 */
import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import ReactMarkdown from "react-markdown";
import { buildPageContext } from "../chat-tools/page-context";
import { useAuth } from "../hooks/useAuth";
import {
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  StopIcon,
  PlusCircleIcon,
  ExclamationTriangleIcon,
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formHeight, setFormHeight] = useState(56);

  // Track whether we're on mobile (< 640px) — reactive to resize
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // On mobile: track how far the visual viewport is pushed up by the keyboard.
  // bottom = window.innerHeight - visualViewport.height - visualViewport.offsetTop
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    if (!open || !isMobile) { setKeyboardOffset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open, isMobile]);

  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 5 * 60_000,
  });
  const assistantName = settings?.["ai.assistant.name"] || t("chat.title");

  const agent = useAgent({ agent: "ChatAgent" });

  const ROUTES: Record<string, string> = {
    dashboard: "/",
    topics: "/topics",
    path: "/path",
    import: "/import",
    settings: "/settings",
  };

  const { messages, sendMessage, stop, status, isStreaming, clearHistory } = useAgentChat({
    agent,
    body: () => ({
      pageContext: buildPageContext(location.pathname, queryClient, user?.id),
    }),
    onToolCall: async ({ toolCall, addToolOutput }) => {
      const { toolCallId, toolName, input } = toolCall;

      // Only handle client-side tools. Server-side tools (getAppGuide, etc.)
      // resolve themselves — calling addToolOutput on them causes a state error.
      const CLIENT_TOOLS = new Set([
        "navigateTo", "refreshData", "startPractice", "openTopicDetail", "toggleDarkMode",
      ]);
      if (!CLIENT_TOOLS.has(toolName)) return;

      try {
        switch (toolName) {
          case "navigateTo": {
            const { page } = input as { page: string };
            const to = ROUTES[page];
            if (to) { navigate({ to }); addToolOutput({ toolCallId, output: { navigated: page } }); }
            else addToolOutput({ toolCallId, output: { error: `Unknown page: ${page}` } });
            break;
          }
          case "refreshData":
            await queryClient.invalidateQueries();
            addToolOutput({ toolCallId, output: { refreshed: true } });
            break;
          case "startPractice": {
            const { topicId, langCode } = input as { topicId: string; langCode: string };
            navigate({ to: `/practice/${topicId}/${langCode}` });
            addToolOutput({ toolCallId, output: { started: true, topicId, langCode } });
            break;
          }
          case "openTopicDetail": {
            const { topicId } = input as { topicId: string };
            navigate({ to: `/topics/${topicId}` });
            addToolOutput({ toolCallId, output: { opened: topicId } });
            break;
          }
          case "toggleDarkMode": {
            document.documentElement.classList.toggle("dark");
            const isDark = document.documentElement.classList.contains("dark");
            localStorage.setItem("theme", isDark ? "dark" : "light");
            addToolOutput({ toolCallId, output: { darkMode: isDark } });
            break;
          }
        }
      } catch (err) {
        addToolOutput({ toolCallId, output: { error: String(err) } });
      }
    },
  });

  // Check if a message has visible content (text or completed tool results)
  const hasVisibleContent = (msg: (typeof messages)[number] | undefined): boolean =>
    msg?.parts.some((p) => {
      if (p.type === "text") return (p as { type: "text"; text: string }).text.trim().length > 0;
      if (p.type === "tool-invocation" && "state" in p && p.state === "output-available") return true;
      return false;
    }) ?? false;

  const lastMsg = messages[messages.length - 1];
  const isActive = status === "streaming" || status === "submitted" || isStreaming;
  const isLoading = isActive;
  const showTypingIndicator = isActive && !hasVisibleContent(lastMsg);

  // Measure form height for messages area bottom padding on mobile.
  // On desktop the form is a shrink-0 flex child — no extra padding needed.
  // On mobile the form floats fixed, so messages need paddingBottom to compensate.
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFormHeight(el.offsetHeight));
    ro.observe(el);
    setFormHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Auto-grow textarea (max ~5 rows / 120px)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens or response finishes
  useEffect(() => {
    if (open && !isLoading) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, isLoading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  if (isHiddenRoute(location.pathname)) return null;



  return (
    <>
      {/* ── Toggle button ─────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="
            fixed bottom-6 right-6 z-[9999]
            w-13 h-13 rounded-full
            bg-orange-500 hover:bg-orange-600
            text-white shadow-lg hover:shadow-xl
            transition-all duration-200
            flex items-center justify-center cursor-pointer
          "
          aria-label={t("chat.open")}
        >
          <ChatBubbleLeftRightIcon className="w-6 h-6" />
        </button>
      )}

      {open && (
        <>
          {/* ── Chat panel ──────────────────────────────────── */}
          <div
            className="
              fixed z-[9998]
              bg-white dark:bg-gray-900
              border border-gray-200 dark:border-gray-700
              shadow-2xl overflow-hidden
              top-0 left-0 right-0 bottom-0
              sm:top-auto sm:left-auto sm:bottom-6 sm:right-6
              sm:w-[440px] sm:h-[640px] sm:rounded-2xl
            "
          >
            {/* Inner wrapper: relative (for absolute overlay) + flex column layout.
                Separated from the outer fixed div to avoid the Tailwind v4 specificity
                clash where .relative { position:relative } overrides .fixed { position:fixed }
                because it appears later in the generated stylesheet. */}
            <div className="relative flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
                <ChatBubbleLeftRightIcon className="w-5 h-5 text-orange-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex-1">
                  {assistantName}
                </span>
                <button
                  onClick={() => { if (messages.length > 0) setShowClearConfirm(true); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label={t("chat.newConversation")}
                  title={t("chat.newConversation")}
                >
                  <PlusCircleIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("chat.newConversation")}</span>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label={t("chat.close")}
                >
                  <XMarkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pt-3 pb-3 space-y-3"
                style={isMobile ? { paddingBottom: `calc(${formHeight}px + 0.75rem)` } : undefined}
              >
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("chat.emptyHint")}</p>
                  </div>
                )}
                {messages.map((m) => {
                  // Don't render an empty assistant bubble while waiting for content
                  if (m.role === "assistant" && !hasVisibleContent(m)) return null;

                  return (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`
                        max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed
                        ${m.role === "user"
                          ? "bg-orange-500 text-white rounded-br-sm"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"}
                      `}>
                        {m.role === "user" ? (
                          m.parts
                            .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                            .map((p, i) => <span key={i} className="whitespace-pre-wrap">{p.text}</span>)
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none
                            prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                            prose-headings:my-2 prose-pre:my-2 prose-code:text-xs
                            prose-a:text-orange-600 dark:prose-a:text-orange-400">
                            {m.parts.map((p, i) => {
                              if (p.type === "text") return <ReactMarkdown key={i}>{p.text}</ReactMarkdown>;
                              if (p.type === "tool-invocation" && "state" in p && p.state === "output-available") {
                                const output = typeof p.output === "string" ? p.output : JSON.stringify(p.output);
                                return <ReactMarkdown key={i}>{output}</ReactMarkdown>;
                              }
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {showTypingIndicator && (
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

              {/* Input bar — single form for both mobile & desktop.
                   Desktop: normal shrink-0 flex child inside the panel.
                   Mobile: position:fixed via inline style, floats above the keyboard. */}
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                className="shrink-0 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-end gap-2"
                style={
                  isMobile
                    ? {
                        position: "fixed",
                        left: 0,
                        right: 0,
                        bottom: keyboardOffset,
                        zIndex: 9999,
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                      }
                    : undefined
                }
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as unknown as FormEvent);
                    }
                  }}
                  placeholder={t("chat.placeholder")}
                  className="
                    flex-1 px-3 py-2 rounded-lg text-sm
                    bg-white dark:bg-gray-800
                    border border-gray-300 dark:border-gray-600
                    text-gray-900 dark:text-gray-100
                    placeholder-gray-400 dark:placeholder-gray-500
                    focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500
                    disabled:opacity-50 resize-none overflow-y-auto leading-normal
                    [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                  "
                  disabled={isLoading}
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer flex items-center justify-center self-center shrink-0"
                    aria-label={t("chat.stop")}
                  >
                    <StopIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="p-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center self-center shrink-0"
                    aria-label={t("chat.send")}
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                )}
              </form>

              {/* Clear-history overlay — uses absolute positioning against the relative inner wrapper */}
              {showClearConfirm && (
                <div className="absolute inset-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-6">
                  <div className="w-full max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-6 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <ExclamationTriangleIcon className="w-6 h-6 text-orange-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t("chat.clearConfirmTitle")}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{t("chat.clearConfirmBody")}</p>
                    </div>
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                      >
                        {t("chat.clearConfirmCancel")}
                      </button>
                      <button
                        onClick={() => { clearHistory(); setShowClearConfirm(false); }}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer"
                      >
                        {t("chat.clearConfirmOk")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>


        </>
      )}
    </>
  );
}
