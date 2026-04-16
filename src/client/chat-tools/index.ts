/**
 * Client-side chat tool registry.
 *
 * These tools run in the browser and are registered with useAgentChat.
 * The LLM sees their schemas alongside server tools and can call them
 * to control the app UI (navigate, refresh data, etc.).
 */
import type { AITool } from "@cloudflare/ai-chat/react";
import type { ClientToolDeps } from "./types";

import { navigateTo } from "./navigate-to";
import { refreshData } from "./refresh-data";
import { startPractice } from "./start-practice";
import { openTopicDetail } from "./open-topic-detail";
import { toggleDarkMode } from "./toggle-dark-mode";

export type { ClientToolDeps };

export function buildClientTools(
  deps: ClientToolDeps,
): Record<string, AITool<unknown, unknown>> {
  return {
    navigateTo: navigateTo(deps),
    refreshData: refreshData(deps),
    startPractice: startPractice(deps),
    openTopicDetail: openTopicDetail(deps),
    toggleDarkMode: toggleDarkMode(),
  };
}
