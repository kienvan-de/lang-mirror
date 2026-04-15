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
import { getPracticeStats } from "./get-practice-stats";
import { getStreak } from "./get-streak";
import { getPracticeCalendar } from "./get-practice-calendar";
import { getMyPath } from "./get-my-path";
import { getSettings } from "./get-settings";

// ── Write tools (v2) ──────────────────────────────────────
import { createTopic } from "./create-topic";
import { addToPath } from "./add-to-path";

export type { ToolDeps };

export function buildAgentTools(deps: ToolDeps): ToolSet {
  return {
    // Read
    listMyTopics: listMyTopics(deps),
    getTopicDetail: getTopicDetail(deps),
    getPracticeStats: getPracticeStats(deps),
    getStreak: getStreak(deps),
    getPracticeCalendar: getPracticeCalendar(deps),
    getMyPath: getMyPath(deps),
    getSettings: getSettings(deps),
    // Write
    createTopic: createTopic(deps),
    addToPath: addToPath(deps),
  };
}
