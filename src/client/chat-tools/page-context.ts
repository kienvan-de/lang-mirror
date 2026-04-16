/**
 * Build a rich page context object from the current URL + TanStack Query cache.
 *
 * Sent with every chat message via the `body` option so the agent always
 * knows what the user is looking at — no extra API calls needed.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Topic, LearningPath } from "../lib/api";
import { langName } from "../lib/lang";

export interface VersionSummary {
  id: string;
  language: string;
  languageName: string;
  sentences: Array<{ id: string; position: number; preview: string }>;
}

export interface PageContext {
  page: string;
  path: string;
  description: string;
  topicId?: string;
  topicTitle?: string;
  topicLanguages?: string[];
  topicTags?: string[];
  topicSentenceCount?: number;
  versions?: VersionSummary[];
  langCode?: string;
  langName?: string;
  pathName?: string;
  pathTopicCount?: number;
}

export function buildPageContext(
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  // ── Dashboard ──────────────────────────────────────────
  if (pathname === "/") {
    return {
      page: "dashboard",
      path: pathname,
      description: "User is on the Dashboard viewing today's stats, streak, and recent topics.",
    };
  }

  // ── Topic detail: /topics/:topicId ─────────────────────
  const topicMatch = pathname.match(/^\/topics\/([^/]+)$/);
  if (topicMatch) {
    const topicId = topicMatch[1]!;
    const topic = queryClient.getQueryData<Topic>(["topic", topicId]);

    if (topic) {
      const languages = topic.versions?.map(
        (v) => `${langName(v.language_code)} (${v.language_code})`
      ) ?? [];
      const sentenceCount = topic.versions?.reduce(
        (sum, v) => sum + (v.totalSentences ?? v.sentences?.length ?? 0),
        0,
      ) ?? 0;
      const tags = topic.tags?.map((t) => t.name) ?? [];

      // Build version summaries with sentence previews
      const versions: VersionSummary[] = (topic.versions ?? []).map((v) => ({
        id: v.id,
        language: v.language_code,
        languageName: langName(v.language_code),
        sentences: (v.sentences ?? [])
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            id: s.id,
            position: s.position,
            preview: s.text.length > 60 ? s.text.slice(0, 57) + "…" : s.text,
          })),
      }));

      return {
        page: "topicDetail",
        path: pathname,
        description: `User is viewing topic "${topic.title}" (ID: ${topicId}). Languages: ${languages.join(", ")}. Total sentences: ${sentenceCount}. Tags: ${tags.join(", ") || "none"}.`,
        topicId,
        topicTitle: topic.title,
        topicLanguages: topic.versions?.map((v) => v.language_code),
        topicTags: tags,
        topicSentenceCount: sentenceCount,
        versions,
      };
    }

    // Topic not in cache yet — provide ID only
    return {
      page: "topicDetail",
      path: pathname,
      description: `User is viewing a topic (ID: ${topicId}). Use getTopicDetail to load full information.`,
      topicId,
    };
  }

  // ── Practice: /practice/:topicId/:langCode ─────────────
  const practiceMatch = pathname.match(/^\/practice\/([^/]+)\/([^/]+)$/);
  if (practiceMatch) {
    const topicId = practiceMatch[1]!;
    const langCode = practiceMatch[2]!;
    const topic = queryClient.getQueryData<Topic>(["topic", topicId]);
    const language = langName(langCode);

    return {
      page: "practice",
      path: pathname,
      description: `User is practicing ${language} (${langCode}) in topic "${topic?.title ?? topicId}".`,
      topicId,
      topicTitle: topic?.title,
      langCode,
      langName: language,
    };
  }

  // ── Practice review: /practice/review ──────────────────
  if (pathname === "/practice/review") {
    return {
      page: "review",
      path: pathname,
      description: "User is on the practice Review page, comparing their recordings with original TTS audio.",
    };
  }

  // ── Topics list: /topics ───────────────────────────────
  if (pathname === "/topics") {
    return {
      page: "topics",
      path: pathname,
      description: "User is browsing their topic list.",
    };
  }

  // ── Learning path: /path ───────────────────────────────
  if (pathname === "/path") {
    const pathData = queryClient.getQueryData<LearningPath>(["path"]);

    if (pathData) {
      return {
        page: "path",
        path: pathname,
        description: `User is viewing their learning path "${pathData.name}" with ${pathData.topics.length} topics.`,
        pathName: pathData.name,
        pathTopicCount: pathData.topics.length,
      };
    }

    return {
      page: "path",
      path: pathname,
      description: "User is viewing their learning path.",
    };
  }

  // ── Import: /import ────────────────────────────────────
  if (pathname === "/import") {
    return {
      page: "import",
      path: pathname,
      description: "User is on the Import page for uploading topic JSON files.",
    };
  }

  // ── Fallback ───────────────────────────────────────────
  return {
    page: "unknown",
    path: pathname,
    description: `User is on ${pathname}.`,
  };
}
