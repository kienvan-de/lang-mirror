/**
 * Build a rich page context from the current URL + TanStack Query cache.
 *
 * Each page has ONE template function that produces the full prompt text.
 * Templates use tagged template literals with .map().join() for loops
 * and ternary for conditionals — zero dependencies.
 *
 * To add context for a new page:
 *   1. Create a template function
 *   2. Create a builder function
 *   3. Add a route entry in PAGE_ROUTES
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Topic, LearningPath, Version, Sentence } from "../lib/api";
import { langName } from "../lib/lang";

// ── Types ────────────────────────────────────────────────

export interface PageContext {
  page: string;
  path: string;
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

// ── Templates ────────────────────────────────────────────
// One function per page. Full prompt text as a single template literal.

interface VersionView {
  id: string;
  langName: string;
  langCode: string;
  sentences: Array<{ id: string; num: number; preview: string }>;
}

const dashboardTemplate = () =>
  `User is on the **Dashboard** viewing today's practice stats, streak calendar, and recent topics.`;

const topicsListTemplate = () =>
  `User is on the **Topics** list page, browsing and searching their topics. They can create a new topic from here.`;

const topicNotCachedTemplate = (topicId: string) =>
  `User is viewing a **topic** (ID: \`${topicId}\`). Data not yet cached.
When the user says "this topic" or "current topic", they mean topic ID \`${topicId}\`.
Use \`getTopicDetail\` to load full information.`;

const topicDetailTemplate = (vars: {
  topicId: string;
  title: string;
  languages: string;
  sentenceCount: number;
  tags: string;
  status: string;
  versions: VersionView[];
}) =>
  `User is viewing topic **"${vars.title}"** (ID: \`${vars.topicId}\`).
Languages: ${vars.languages}. Total sentences: ${vars.sentenceCount}. Tags: ${vars.tags}.
Status: ${vars.status}.

When the user says "this topic", "current topic", or "here", they mean topic ID \`${vars.topicId}\` ("${vars.title}").${
    vars.versions.length
      ? `

### Versions & Sentences
${vars.versions
  .map(
    (v) =>
      `**${v.langName}** (${v.langCode}) — version ID: \`${v.id}\`, ${v.sentences.length} sentences:
${v.sentences.map((s) => `  ${s.num}. [id:\`${s.id}\`] "${s.preview}"`).join("\n")}`,
  )
  .join("\n")}

Use these sentence IDs directly when the user refers to a sentence by number or text.
Use the version ID when adding sentences or fetching version detail.
Use the topic ID when adding a new language version.`
      : ""
  }`;

const practiceTemplate = (vars: {
  topicId: string;
  title: string;
  language: string;
  langCode: string;
  versionId?: string;
  sentences: Array<{ id: string; num: number; preview: string }>;
}) =>
  `User is **practicing** ${vars.language} (${vars.langCode}) in topic "${vars.title}" (ID: \`${vars.topicId}\`).
The practice flow is: TTS playback → countdown → record → upload → playback comparison.${
    vars.versionId
      ? `

Practicing version \`${vars.versionId}\` with ${vars.sentences.length} sentences:
${vars.sentences.map((s) => `  ${s.num}. [id:\`${s.id}\`] "${s.preview}"`).join("\n")}

When the user asks about "this sentence" or "current sentence", use the sentence ID above.`
      : ""
  }

When the user says "this topic", they mean topic ID \`${vars.topicId}\` ("${vars.title}").`;

const reviewTemplate = () =>
  `User is on the **Practice Review** page, comparing their recordings with the original TTS audio sentence by sentence.`;

interface PathTopicView {
  num: number;
  title: string;
  topicId: string;
  langs: string;
  progress: string;
}

const pathTemplate = (vars: {
  name: string;
  pathId: string;
  topics: PathTopicView[];
}) =>
  `User is viewing their **Learning Path** "${vars.name}" (ID: \`${vars.pathId}\`).
Contains ${vars.topics.length} topics:
${vars.topics
  .map(
    (tp) =>
      `  ${tp.num}. "${tp.title}" (ID: \`${tp.topicId}\`) — ${tp.langs} — ${tp.progress}`,
  )
  .join("\n")}

When the user says "add to my path", use path ID \`${vars.pathId}\`.`;

const pathEmptyTemplate = () =>
  `User is viewing their **Learning Path**.`;

const importTemplate = () =>
  `User is on the **Import** page for uploading topic JSON files. They can also ask you to create topics directly instead of importing.`;

const fallbackTemplate = (path: string) =>
  `User is on \`${path}\`.`;

// ── Helpers ──────────────────────────────────────────────

function sentencePreview(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "…" : text;
}

function toVersionViews(versions: Version[]): VersionView[] {
  return versions.map((v) => ({
    id: v.id,
    langName: langName(v.language_code),
    langCode: v.language_code,
    sentences: (v.sentences ?? [])
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        num: s.position + 1,
        preview: sentencePreview(s.text),
      })),
  }));
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
  return { page: "unknown", path: pathname, prompt: fallbackTemplate(pathname) };
}

// ── Page builders ────────────────────────────────────────

function buildDashboard(pathname: string): PageContext {
  return { page: "dashboard", path: pathname, prompt: dashboardTemplate() };
}

function buildTopicsList(pathname: string): PageContext {
  return { page: "topics", path: pathname, prompt: topicsListTemplate() };
}

function buildTopicDetail(
  pathname: string,
  queryClient: QueryClient,
  params: Record<string, string>,
): PageContext {
  const { topicId } = params;
  const topic = queryClient.getQueryData<Topic>(["topic", topicId]);

  if (!topic) {
    return { page: "topicDetail", path: pathname, prompt: topicNotCachedTemplate(topicId) };
  }

  const languages =
    topic.versions?.map((v) => `${langName(v.language_code)} (${v.language_code})`).join(", ") ||
    "none";
  const sentenceCount =
    topic.versions?.reduce(
      (sum, v) => sum + (v.totalSentences ?? v.sentences?.length ?? 0),
      0,
    ) ?? 0;
  const tags = topic.tags?.map((tg) => tg.name).join(", ") || "none";

  return {
    page: "topicDetail",
    path: pathname,
    prompt: topicDetailTemplate({
      topicId,
      title: topic.title,
      languages,
      sentenceCount,
      tags,
      status: topic.status,
      versions: toVersionViews(topic.versions ?? []),
    }),
  };
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
  const version = topic?.versions?.find((v) => v.language_code === langCode);

  const sentences = (version?.sentences ?? [])
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      num: s.position + 1,
      preview: sentencePreview(s.text),
    }));

  return {
    page: "practice",
    path: pathname,
    prompt: practiceTemplate({
      topicId,
      title,
      language,
      langCode,
      versionId: version?.id,
      sentences,
    }),
  };
}

function buildReview(pathname: string): PageContext {
  return { page: "review", path: pathname, prompt: reviewTemplate() };
}

function buildPath(
  pathname: string,
  queryClient: QueryClient,
): PageContext {
  const pathData = queryClient.getQueryData<LearningPath>(["path"]);

  if (!pathData) {
    return { page: "path", path: pathname, prompt: pathEmptyTemplate() };
  }

  return {
    page: "path",
    path: pathname,
    prompt: pathTemplate({
      name: pathData.name,
      pathId: pathData.id,
      topics: pathData.topics.map((tp) => ({
        num: tp.position + 1,
        title: tp.topic_title,
        topicId: tp.topic_id,
        langs: tp.topic_versions.map((v) => v.language_code).join(", "),
        progress: tp.isDone
          ? "✅ done"
          : `${tp.practicedSentences}/${tp.totalSentences} practiced`,
      })),
    }),
  };
}

function buildImport(pathname: string): PageContext {
  return { page: "import", path: pathname, prompt: importTemplate() };
}
