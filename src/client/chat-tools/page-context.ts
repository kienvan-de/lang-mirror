/**
 * Build a rich page context from the current URL + TanStack Query cache.
 *
 * Each page builder produces a self-contained `prompt` string that is
 * appended to the system prompt as-is. The prompt builder in agent-config
 * never interprets PageContext fields — it just renders `context.prompt`.
 *
 * To add context for a new page:
 *   1. Add a route matcher below
 *   2. Return a PageContext with a descriptive `prompt` string
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Topic, LearningPath } from "../lib/api";
import { langName } from "../lib/lang";

export interface PageContext {
  /** Machine-readable page identifier */
  page: string;
  /** Current URL path */
  path: string;
  /** Full prompt text to append to the system prompt — self-contained per page */
  prompt: string;
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
      prompt: "User is on the **Dashboard** viewing today's practice stats, streak calendar, and recent topics.",
    };
  }

  // ── Topic detail: /topics/:topicId ─────────────────────
  const topicMatch = pathname.match(/^\/topics\/([^/]+)$/);
  if (topicMatch) {
    return buildTopicDetailContext(topicMatch[1]!, pathname, queryClient);
  }

  // ── Practice: /practice/:topicId/:langCode ─────────────
  const practiceMatch = pathname.match(/^\/practice\/([^/]+)\/([^/]+)$/);
  if (practiceMatch) {
    return buildPracticeContext(practiceMatch[1]!, practiceMatch[2]!, pathname, queryClient);
  }

  // ── Practice review: /practice/review ──────────────────
  if (pathname === "/practice/review") {
    return {
      page: "review",
      path: pathname,
      prompt: "User is on the **Practice Review** page, comparing their recordings with the original TTS audio sentence by sentence.",
    };
  }

  // ── Topics list: /topics ───────────────────────────────
  if (pathname === "/topics") {
    return {
      page: "topics",
      path: pathname,
      prompt: "User is on the **Topics** list page, browsing and searching their topics. They can create a new topic from here.",
    };
  }

  // ── Learning path: /path ───────────────────────────────
  if (pathname === "/path") {
    return buildPathContext(pathname, queryClient);
  }

  // ── Import: /import ────────────────────────────────────
  if (pathname === "/import") {
    return {
      page: "import",
      path: pathname,
      prompt: "User is on the **Import** page for uploading topic JSON files. They can also ask you to create topics directly instead of importing.",
    };
  }

  // ── Fallback ───────────────────────────────────────────
  return {
    page: "unknown",
    path: pathname,
    prompt: `User is on \`${pathname}\`.`,
  };
}

// ── Page-specific context builders ─────────────────────────

function buildTopicDetailContext(
  topicId: string,
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  const topic = queryClient.getQueryData<Topic>(["topic", topicId]);

  if (!topic) {
    return {
      page: "topicDetail",
      path: pathname,
      prompt: [
        `User is viewing a **topic** (ID: \`${topicId}\`). Data not yet cached.`,
        `When the user says "this topic" or "current topic", they mean topic ID \`${topicId}\`.`,
        `Use \`getTopicDetail\` to load full information.`,
      ].join("\n"),
    };
  }

  const lines: string[] = [];

  // Header
  const languages = topic.versions?.map(
    (v) => `${langName(v.language_code)} (${v.language_code})`,
  ) ?? [];
  const sentenceCount = topic.versions?.reduce(
    (sum, v) => sum + (v.totalSentences ?? v.sentences?.length ?? 0),
    0,
  ) ?? 0;
  const tags = topic.tags?.map((t) => t.name) ?? [];

  lines.push(
    `User is viewing topic **"${topic.title}"** (ID: \`${topicId}\`).`,
    `Languages: ${languages.join(", ") || "none"}. Total sentences: ${sentenceCount}. Tags: ${tags.join(", ") || "none"}.`,
    `Status: ${topic.status}.`,
    "",
    `When the user says "this topic", "current topic", or "here", they mean topic ID \`${topicId}\` ("${topic.title}").`,
  );

  // Version & sentence details
  if (topic.versions?.length) {
    lines.push("", "### Versions & Sentences");
    for (const v of topic.versions) {
      const sorted = (v.sentences ?? []).sort((a, b) => a.position - b.position);
      lines.push(
        `**${langName(v.language_code)}** (${v.language_code}) — version ID: \`${v.id}\`, ${sorted.length} sentences:`,
      );
      for (const s of sorted) {
        const preview = s.text.length > 60 ? s.text.slice(0, 57) + "…" : s.text;
        lines.push(`  ${s.position + 1}. [id:\`${s.id}\`] "${preview}"`);
      }
    }
    lines.push(
      "",
      "Use these sentence IDs directly when the user refers to a sentence by number or text.",
      "Use the version ID when adding sentences or a new language version.",
    );
  }

  return {
    page: "topicDetail",
    path: pathname,
    prompt: lines.join("\n"),
  };
}

function buildPracticeContext(
  topicId: string,
  langCode: string,
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  const topic = queryClient.getQueryData<Topic>(["topic", topicId]);
  const language = langName(langCode);
  const topicTitle = topic?.title ?? topicId;

  const lines: string[] = [
    `User is **practicing** ${language} (${langCode}) in topic "${topicTitle}" (ID: \`${topicId}\`).`,
    `The practice flow is: TTS playback → countdown → record → upload → playback comparison.`,
  ];

  // Find the version being practiced
  const version = topic?.versions?.find((v) => v.language_code === langCode);
  if (version?.sentences?.length) {
    lines.push(
      "",
      `Practicing version \`${version.id}\` with ${version.sentences.length} sentences.`,
      `When the user asks about "this sentence" or "current sentence", they likely mean one of these.`,
    );
  }

  lines.push(
    "",
    `When the user says "this topic", they mean topic ID \`${topicId}\` ("${topicTitle}").`,
  );

  return {
    page: "practice",
    path: pathname,
    prompt: lines.join("\n"),
  };
}

function buildPathContext(
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  const pathData = queryClient.getQueryData<LearningPath>(["path"]);

  if (!pathData) {
    return {
      page: "path",
      path: pathname,
      prompt: "User is viewing their **Learning Path**.",
    };
  }

  const lines: string[] = [
    `User is viewing their **Learning Path** "${pathData.name}" (ID: \`${pathData.id}\`).`,
    `Contains ${pathData.topics.length} topics:`,
  ];

  for (const t of pathData.topics) {
    const langs = t.topic_versions.map((v) => v.language_code).join(", ");
    const progress = t.isDone ? "✅ done" : `${t.practicedSentences}/${t.totalSentences} practiced`;
    lines.push(
      `  ${t.position + 1}. "${t.topic_title}" (ID: \`${t.topic_id}\`) — ${langs} — ${progress}`,
    );
  }

  lines.push(
    "",
    `When the user says "add to my path", use path ID \`${pathData.id}\`.`,
  );

  return {
    page: "path",
    path: pathname,
    prompt: lines.join("\n"),
  };
}
