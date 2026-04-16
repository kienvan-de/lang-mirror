/**
 * Build a rich page context from the current URL + TanStack Query cache.
 *
 * Each page has ONE template function that produces the full prompt text,
 * including page-specific workflow instructions. Workflows are co-located
 * with the pages where they're relevant, so the LLM only sees applicable
 * instructions per page.
 *
 * Write workflows are only included for topics the user owns.
 * Practice and review pages are read-only — no write workflows.
 *
 * To add context for a new page:
 *   1. Create a template function
 *   2. Create a builder function
 *   3. Add a route entry in PAGE_ROUTES
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Topic, LearningPath, Version } from "../lib/api";
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
  userId?: string,
) => PageContext;

interface RouteEntry {
  pattern: RegExp;
  page: string;
  builder: PageBuilder;
}

// ── Shared workflow instructions ─────────────────────────
// The agent already knows native/learning languages from the User Profile
// section in the system prompt, so workflows reference them generically.

const WORKFLOW_CREATE_TOPIC = `### Workflow: Create a New Topic
Follow these steps in order:
1. Ask the user to describe the topic they want to create
2. Present the user's learning languages (from their profile) and ask which ones to include
3. Ask approximately how many sentences they want
4. Generate a topic structure:
   - Title and description
   - Sentences in the user's native language first
   - For each sentence, generate notes with grammar explanations and key vocabulary in all selected learning languages
5. Present the native-language version to the user for review
6. If confirmed, generate sentence translations for each selected learning language, each with notes in the native language and all other selected languages
7. Present the complete topic for final review
8. On confirmation, call \`createTopic\` with the full structure`;

const WORKFLOW_ADD_LANGUAGE_VERSION = `### Workflow: Add a Language Version
1. If version info is not available in the current context, use \`getTopicDetail\` to see what language versions already exist
2. Present the user's learning languages that are **not yet** in this topic, and ask which one to add
3. **If the topic has existing versions:**
   - Use the existing version's sentences as reference to generate translations
   - Generate notes for grammar and vocabulary in the native language and all existing version languages
   - Present for review, then call \`addLanguageVersion\` followed by \`addSentences\`
4. **If the topic has no versions yet:**
   - Ask the user to describe the content
   - Generate sentences in the native language first with notes in the chosen learning language
   - Present for review, generate the learning language version
   - Call \`addLanguageVersion\` + \`addSentences\` for each language`;

const WORKFLOW_ADD_SENTENCES = `### Workflow: Add Sentences
1. Ask the user which language version to add sentences to (or use the one from context)
2. Ask the user to describe the content for the new sentences
3. Generate sentences in the target language based on the described content
4. For each sentence, generate notes with grammar and vocabulary in the native language and all other language versions of the topic
5. Present for review, then call \`addSentences\``;

const WORKFLOW_UPDATE_SENTENCE = `### Workflow: Update a Sentence
1. Use \`getSentenceDetail\` to get the sentence's current text and notes (sentence ID from context)
2. Ask the user what they want to change
3. Generate the updated sentence based on current content and requested changes
4. Generate updated notes with grammar and vocabulary in the native language and all other language versions
5. Present for review, then call \`updateSentence\``;

const OWNERSHIP_NOTE =
  "**Note:** Write workflows (add version, add sentences, update sentence) only apply to topics you own. " +
  "For shared/public topics, the user can only read and practice.";

// ── View types ───────────────────────────────────────────

interface VersionView {
  id: string;
  langName: string;
  langCode: string;
  sentences: Array<{ id: string; num: number; preview: string }>;
}

interface PathTopicView {
  num: number;
  title: string;
  topicId: string;
  langs: string;
  progress: string;
}

// ── Templates ────────────────────────────────────────────

const dashboardTemplate = () =>
  `User is on the **Dashboard** viewing today's practice stats, streak calendar, and recent topics.

## Available Workflows
${WORKFLOW_CREATE_TOPIC}`;

const topicsListTemplate = () =>
  `User is on the **Topics** list page, browsing and searching their topics.

## Available Workflows
${WORKFLOW_CREATE_TOPIC}`;

const topicNotCachedTemplate = (topicId: string) =>
  `User is viewing a **topic** (ID: \`${topicId}\`). Data not yet cached.
When the user says "this topic" or "current topic", they mean topic ID \`${topicId}\`.
Use \`getTopicDetail\` to load full information before performing any action.`;

const topicDetailOwnedTemplate = (vars: {
  topicId: string;
  title: string;
  languages: string;
  sentenceCount: number;
  tags: string;
  status: string;
  versions: VersionView[];
}) =>
  `${topicDetailHeader(vars)}${
    vars.versions.length
      ? `

Use these sentence IDs directly when the user refers to a sentence by number or text.
Use the version ID when adding sentences or fetching version detail.
Use the topic ID when adding a new language version.`
      : ""
  }

## Available Workflows
${WORKFLOW_ADD_LANGUAGE_VERSION}
${WORKFLOW_ADD_SENTENCES}
${WORKFLOW_UPDATE_SENTENCE}`;

const topicDetailSharedTemplate = (vars: {
  topicId: string;
  title: string;
  languages: string;
  sentenceCount: number;
  tags: string;
  status: string;
  versions: VersionView[];
}) =>
  `${topicDetailHeader(vars)}${
    vars.versions.length
      ? `

Use these sentence IDs when the user refers to a sentence by number or text for explanations.`
      : ""
  }

${OWNERSHIP_NOTE}`;

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

When the user says "this topic", they mean topic ID \`${vars.topicId}\` ("${vars.title}").

Practice mode is read-only. The user can ask about grammar, vocabulary, or sentence explanations, but content editing should be done from the topic detail page.`;

const reviewTemplate = () =>
  `User is on the **Practice Review** page, comparing their recordings with the original TTS audio sentence by sentence.

Review mode is read-only. The user can ask about pronunciation, grammar, or request explanations.`;

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

When the user says "add to my path", use path ID \`${vars.pathId}\`.

## Available Workflows
${WORKFLOW_CREATE_TOPIC}`;

const pathEmptyTemplate = () =>
  `User is viewing their **Learning Path**.

## Available Workflows
${WORKFLOW_CREATE_TOPIC}`;

const importTemplate = () =>
  `User is on the **Import** page for uploading topic JSON files. They can also ask you to create topics directly instead of importing.

## Available Workflows
${WORKFLOW_CREATE_TOPIC}`;

const fallbackTemplate = (path: string) =>
  `User is on \`${path}\`.`;

// ── Shared template parts ────────────────────────────────

function topicDetailHeader(vars: {
  topicId: string;
  title: string;
  languages: string;
  sentenceCount: number;
  tags: string;
  status: string;
  versions: VersionView[];
}): string {
  const lines: string[] = [
    `User is viewing topic **"${vars.title}"** (ID: \`${vars.topicId}\`).`,
    `Languages: ${vars.languages}. Total sentences: ${vars.sentenceCount}. Tags: ${vars.tags}.`,
    `Status: ${vars.status}.`,
    "",
    `When the user says "this topic", "current topic", or "here", they mean topic ID \`${vars.topicId}\` ("${vars.title}").`,
  ];

  if (vars.versions.length) {
    lines.push(
      "",
      "### Versions & Sentences",
      ...vars.versions.flatMap((v) => [
        `**${v.langName}** (${v.langCode}) — version ID: \`${v.id}\`, ${v.sentences.length} sentences:`,
        ...v.sentences.map(
          (s) => `  ${s.num}. [id:\`${s.id}\`] "${s.preview}"`,
        ),
      ]),
    );
  }

  return lines.join("\n");
}

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
  userId?: string,
): PageContext {
  for (const route of PAGE_ROUTES) {
    const match = pathname.match(route.pattern);
    if (match) {
      return route.builder(pathname, queryClient, match.groups ?? {}, userId);
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
  userId?: string,
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

  const vars = {
    topicId,
    title: topic.title,
    languages,
    sentenceCount,
    tags,
    status: topic.status,
    versions: toVersionViews(topic.versions ?? []),
  };

  const isOwner = userId != null && topic.owner_id === userId;
  const template = isOwner ? topicDetailOwnedTemplate : topicDetailSharedTemplate;

  return { page: "topicDetail", path: pathname, prompt: template(vars) };
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
