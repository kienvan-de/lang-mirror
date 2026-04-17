/**
 * Agent tool registry — assembles individual tool files into a ToolSet.
 *
 * To add a tool:
 *   1. Create a new file in this directory (e.g. create-topic.ts)
 *   2. Export a function that takes Pick<ToolDeps, ...> and returns tool(...)
 *   3. Import and register it below
 *   4. Add the service to ToolDeps if needed (types.ts)
 *
 * To remove a tool:
 *   1. Delete the file
 *   2. Remove the import and registration below
 */
import type { ToolSet } from "ai";
import type { ToolDeps } from "./types";

// ── Read tools (v1) ────────────────────────────────────────
import { listMyTopics } from "./list-my-topics";
import { getTopicDetail } from "./get-topic-detail";
import { getVersionDetail } from "./get-version-detail";
import { getSentenceDetail } from "./get-sentence-detail";
import { getPracticeStats } from "./get-practice-stats";
import { getStreak } from "./get-streak";
import { getPracticeCalendar } from "./get-practice-calendar";
import { getMyPath } from "./get-my-path";
import { getSettings } from "./get-settings";

// ── Write tools (v2) ──────────────────────────────────────
import { createTopic } from "./create-topic";
import { addLanguageVersion } from "./add-language-version";
import { addSentences } from "./add-sentences";
import { updateSentence } from "./update-sentence";
import { addToPath } from "./add-to-path";

// ── Utility tools ─────────────────────────────────────────
import { getAppGuide } from "./get-app-guide";

// ── Client tools (no execute — handled browser-side via onToolCall) ──
import { navigateToTool } from "./navigate-to";
import { refreshDataTool } from "./refresh-data";
import { startPracticeTool } from "./start-practice";
import { openTopicDetailTool } from "./open-topic-detail";
import { toggleDarkModeTool } from "./toggle-dark-mode";

export type { ToolDeps };

/**
 * Tool names that should stop the streamText loop after execution.
 *
 * - Write tools: the LLM already composed the content — a second inference
 *   to "read back" the confirmation wastes time and risks hitting the
 *   30-second Worker wall-time limit (each Workers AI call takes 10-20s).
 * - Client tools: have no `execute` on the server — AIChatAgent handles
 *   the browser round-trip via its own auto-continuation mechanism.
 */
export const STOP_AFTER_TOOL_NAMES = new Set([
  // Write tools (server-side) — stop loop to avoid second inference timeout
  "createTopic",
  "addLanguageVersion",
  "addSentences",
  "updateSentence",
  "addToPath",
  // Client tools (no execute — AIChatAgent handles auto-continuation)
  "navigateTo",
  "refreshData",
  "startPractice",
  "openTopicDetail",
  "toggleDarkMode",
]);

export function buildAgentTools(deps: ToolDeps): ToolSet {
  return {
    // Read
    listMyTopics: listMyTopics(deps),
    getTopicDetail: getTopicDetail(deps),
    getVersionDetail: getVersionDetail(deps),
    getSentenceDetail: getSentenceDetail(deps),
    getPracticeStats: getPracticeStats(deps),
    getStreak: getStreak(deps),
    getPracticeCalendar: getPracticeCalendar(deps),
    getMyPath: getMyPath(deps),
    getSettings: getSettings(deps),
    // Write
    createTopic: createTopic(deps),
    addLanguageVersion: addLanguageVersion(deps),
    addSentences: addSentences(deps),
    updateSentence: updateSentence(deps),
    addToPath: addToPath(deps),
    // Utility
    getAppGuide: getAppGuide(),
    // Client (no execute — routed to browser via onToolCall)
    navigateTo: navigateToTool(),
    refreshData: refreshDataTool(),
    startPractice: startPracticeTool(),
    openTopicDetail: openTopicDetailTool(),
    toggleDarkMode: toggleDarkModeTool(),
  };
}
