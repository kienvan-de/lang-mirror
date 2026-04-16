/**
 * Build a rich page context from the current URL + TanStack Query cache.
 *
 * Each page builder produces a self-contained `prompt` string that is
 * appended to the system prompt as-is. The prompt builder in agent-config
 * never interprets PageContext fields — it just renders `context.prompt`.
 *
 * To add context for a new page:
 *   1. Add a route entry in PAGE_ROUTES
 *   2. Create a builder function
 *   3. Return a PageContext with a descriptive `prompt` string
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Topic, LearningPath } from "../lib/api";
import { langName } from "../lib/lang";

// ── Types ────────────────────────────────────────────────

export interface PageContext {
  /** Machine-readable page identifier */
  page: string;
  /** Current URL path */
  path: string;
  /** Self-contained prompt text — appended as-is to the system prompt */
  prompt: string;
}

type PageBuilder = (
  pathname: string,
  queryClient: QueryClient,
  params: Record<string, string>,
) => PageContext;

interface RouteEntry {
  pattern: RegExp;
  page: string;
  builder: PageBuilder;
}

// ── Prompt templates ─────────────────────────────────────

const TEMPLATES = {
  dashboard:
    "User is on the **Dashboard** viewing today's practice stats, streak calendar, and recent topics.",

  topicsList:
    "User is on the **Topics** list page, browsing and searching their topics. They can create a new topic from here.",

  topicNotCached: [
    'User is viewing a **topic** (ID: `{topicId}`). Data not yet cached.',
    'When the user says "this topic" or "current topic", they mean topic ID `{topicId}`.',
    "Use `getTopicDetail` to load full information.",
  ].join("\n"),

  topicHeader: [
    'User is viewing topic **"{title}"** (ID: `{topicId}`).',
    "Languages: {languages}. Total sentences: {sentenceCount}. Tags: {tags}.",
    "Status: {status}.",
  ].join("\n"),

  topicReference:
    'When the user says "this topic", "current topic", or "here", they mean topic ID `{topicId}` ("{title}").',

  versionsHeader: "### Versions & Sentences",

  versionEntry:
    "**{langName}** ({langCode}) — version ID: `{versionId}`, {count} sentences:",

  sentenceEntry: '  {num}. [id:`{id}`] "{preview}"',

  versionsFooter: [
    "Use these sentence IDs directly when the user refers to a sentence by number or text.",
    "Use the version ID when adding sentences or a new language version.",
  ].join("\n"),

  practiceHeader: [
    'User is **practicing** {language} ({langCode}) in topic "{title}" (ID: `{topicId}`).',
    "The practice flow is: TTS playback → countdown → record → upload → playback comparison.",
  ].join("\n"),

  practiceVersion:
    "Practicing version `{versionId}` with {count} sentences.\n" +
    'When the user asks about "this sentence" or "current sentence", they likely mean one of these.',

  practiceReference:
    'When the user says "this topic", they mean topic ID `{topicId}` ("{title}").',

  review:
    "User is on the **Practice Review** page, comparing their recordings with the original TTS audio sentence by sentence.",

  pathEmpty: "User is viewing their **Learning Path**.",

  pathHeader:
    'User is viewing their **Learning Path** "{name}" (ID: `{pathId}`).\nContains {count} topics:',

  pathTopic:
    '  {num}. "{title}" (ID: `{topicId}`) — {langs} — {progress}',

  pathReference: 'When the user says "add to my path", use path ID `{pathId}`.',

  importPage:
    "User is on the **Import** page for uploading topic JSON files. They can also ask you to create topics directly instead of importing.",

  fallback: "User is on `{path}`.",
} as const;

// ── Template helper ──────────────────────────────────────

function t(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    template,
  );
}

// ── Route table ──────────────────────────────────────────

const PAGE_ROUTES: RouteEntry[] = [
  { pattern: /^\/$/, page: "dashboard", builder: buildDashboard },
  { pattern: /^\/topics$/, page: "topics", builder: buildTopicsList },
  { pattern: /^\/topics\/(?<topicId>[^/]+)$/, page: "topicDetail", builder: buildTopicDetail },
  { pattern: /^\/practice\/(?<topicId>[^/]+)\/(?<langCode>[^/]+)$/, page: "practice", builder: buildPractice },
  { pattern: /^\/practice\/review$/, page: "review", builder: buildReview },
  { pattern: /^\/path$/, page: "path", builder: buildPath },
  { pattern: /^\/import$/, page: "import", builder: buildImport },
];

// ── Main entry point ─────────────────────────────────────

export function buildPageContext(
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  for (const route of PAGE_ROUTES) {
    const match = pathname.match(route.pattern);
    if (match) {
      return route.builder(pathname, queryClient, match.groups ?? {});
    }
  }

  return {
    page: "unknown",
    path: pathname,
    prompt: t(TEMPLATES.fallback, { path: pathname }),
  };
}

// ── Page builders ────────────────────────────────────────

function buildDashboard(pathname: string): PageContext {
  return { page: "dashboard", path: pathname, prompt: TEMPLATES.dashboard };
}

function buildTopicsList(pathname: string): PageContext {
  return { page: "topics", path: pathname, prompt: TEMPLATES.topicsList };
}

function buildTopicDetail(
  pathname: string,
  queryClient: QueryClient,
  params: Record<string, string>,
): PageContext {
  const { topicId } = params;
  const topic = queryClient.getQueryData<Topic>(["topic", topicId]);

  if (!topic) {
    return {
      page: "topicDetail",
      path: pathname,
      prompt: t(TEMPLATES.topicNotCached, { topicId }),
    };
  }

  const languages =
    topic.versions?.map((v) => `${langName(v.language_code)} (${v.language_code})`).join(", ") ||
    "none";
  const sentenceCount = topic.versions?.reduce(
    (sum, v) => sum + (v.totalSentences ?? v.sentences?.length ?? 0),
    0,
  ) ?? 0;
  const tags = topic.tags?.map((tg) => tg.name).join(", ") || "none";

  const lines: string[] = [
    t(TEMPLATES.topicHeader, {
      title: topic.title,
      topicId,
      languages,
      sentenceCount,
      tags,
      status: topic.status,
    }),
    "",
    t(TEMPLATES.topicReference, { topicId, title: topic.title }),
  ];

  // Version & sentence summaries
  if (topic.versions?.length) {
    lines.push("", TEMPLATES.versionsHeader);
    for (const v of topic.versions) {
      const sorted = (v.sentences ?? []).sort((a, b) => a.position - b.position);
      lines.push(
        t(TEMPLATES.versionEntry, {
          langName: langName(v.language_code),
          langCode: v.language_code,
          versionId: v.id,
          count: sorted.length,
        }),
      );
      for (const s of sorted) {
        const preview = s.text.length > 60 ? s.text.slice(0, 57) + "…" : s.text;
        lines.push(t(TEMPLATES.sentenceEntry, { num: s.position + 1, id: s.id, preview }));
      }
    }
    lines.push("", TEMPLATES.versionsFooter);
  }

  return { page: "topicDetail", path: pathname, prompt: lines.join("\n") };
}

function buildPractice(
  pathname: string,
  queryClient: QueryClient,
  params: Record<string, string>,
): PageContext {
  const { topicId, langCode } = params;
  const topic = queryClient.getQueryData<Topic>(["topic", topicId]);
  const language = langName(langCode);
  const title = topic?.title ?? topicId;

  const lines: string[] = [
    t(TEMPLATES.practiceHeader, { language, langCode, title, topicId }),
  ];

  const version = topic?.versions?.find((v) => v.language_code === langCode);
  if (version?.sentences?.length) {
    lines.push(
      "",
      t(TEMPLATES.practiceVersion, { versionId: version.id, count: version.sentences.length }),
    );
  }

  lines.push("", t(TEMPLATES.practiceReference, { topicId, title }));

  return { page: "practice", path: pathname, prompt: lines.join("\n") };
}

function buildReview(pathname: string): PageContext {
  return { page: "review", path: pathname, prompt: TEMPLATES.review };
}

function buildPath(
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  const pathData = queryClient.getQueryData<LearningPath>(["path"]);

  if (!pathData) {
    return { page: "path", path: pathname, prompt: TEMPLATES.pathEmpty };
  }

  const lines: string[] = [
    t(TEMPLATES.pathHeader, {
      name: pathData.name,
      pathId: pathData.id,
      count: pathData.topics.length,
    }),
  ];

  for (const tp of pathData.topics) {
    const langs = tp.topic_versions.map((v) => v.language_code).join(", ");
    const progress = tp.isDone
      ? "✅ done"
      : `${tp.practicedSentences}/${tp.totalSentences} practiced`;
    lines.push(
      t(TEMPLATES.pathTopic, {
        num: tp.position + 1,
        title: tp.topic_title,
        topicId: tp.topic_id,
        langs,
        progress,
      }),
    );
  }

  lines.push("", t(TEMPLATES.pathReference, { pathId: pathData.id }));

  return { page: "path", path: pathname, prompt: lines.join("\n") };
}

function buildImport(pathname: string): PageContext {
  return { page: "import", path: pathname, prompt: TEMPLATES.importPage };
}
