/**
 * Core import service — parse/validate + DB write.
 *
 * Parsing supports JSON + YAML (via optional yamlParse callback injected by caller).
 * This keeps the core free of js-yaml dependency while desktop can inject it.
 * CF Worker passes undefined (JSON-only).
 */
import type { IDatabase } from "../ports/db.port";
import { NotFoundError, ConflictError, ValidationError as DomainValidationError } from "../errors";
import { requireAuth } from "../auth/context";

// ── Import types ──────────────────────────────────────────────────────────────

export interface ImportSentence {
  text: string;
  notes?: Record<string, string>;
}

export interface ImportVersion {
  language: string;
  title?: string;
  description?: string;
  voice_name?: string;
  speed?: number;
  pitch?: number;
  sentences: ImportSentence[];
}

export interface LessonImportSingle {
  format: "single";
  title: string;
  description?: string;
  language: string;
  voice_name?: string;
  speed?: number;
  pitch?: number;
  sentences: ImportSentence[];
  tags?: string[]; // tag names
}

export interface LessonImportTopic {
  format: "topic";
  title: string;
  description?: string;
  versions: ImportVersion[];
  tags?: string[]; // tag names
}

export type LessonImport = LessonImportSingle | LessonImportTopic;

export interface ImportValidationError { field: string; message: string }

export interface ParseResult {
  data: LessonImport | null;
  errors: ImportValidationError[];
  parseError?: string;
}

export interface ImportResult {
  topic: { id: string; title: string };
  versions: Array<{ versionId: string; language: string; sentenceCount: number }>;
  totalSentences: number;
  skipped?: boolean;
}

const MAX_TAGS    = 20;
const MAX_TAG_LEN = 100;

// ── Validators ────────────────────────────────────────────────────────────────

function validateString(
  val: unknown, field: string,
  opts: { required?: boolean; maxLen?: number },
  errors: ImportValidationError[]
): string | undefined {
  if (val === undefined || val === null || val === "") {
    if (opts.required) errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (typeof val !== "string") { errors.push({ field, message: `${field} must be a string` }); return undefined; }
  if (opts.maxLen && val.length > opts.maxLen) {
    errors.push({ field, message: `${field} must be at most ${opts.maxLen} characters` });
  }
  return val;
}

function validateSentences(raw: unknown, field: string, errors: ImportValidationError[]): ImportSentence[] {
  if (!Array.isArray(raw)) { errors.push({ field, message: `${field} must be an array` }); return []; }
  if (raw.length === 0)    { errors.push({ field, message: `${field} must have at least 1 sentence` }); return []; }
  if (raw.length > 500)    { errors.push({ field, message: `${field} must have at most 500 sentences` }); }

  const result: ImportSentence[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] as Record<string, unknown>;
    if (typeof s !== "object" || s === null) { errors.push({ field: `${field}[${i}]`, message: "Must be an object" }); continue; }

    const text = validateString(s["text"], `${field}[${i}].text`, { required: true, maxLen: 2000 }, errors);
    let notes: Record<string, string> | undefined;

    if (s["notes"] !== undefined && s["notes"] !== null) {
      if (typeof s["notes"] !== "object" || Array.isArray(s["notes"])) {
        errors.push({ field: `${field}[${i}].notes`, message: "notes must be an object" });
      } else {
        notes = {};
        for (const [lang, val] of Object.entries(s["notes"] as Record<string, unknown>)) {
          const v = validateString(val, `${field}[${i}].notes.${lang}`, { maxLen: 4000 }, errors);
          if (v !== undefined) notes[lang] = v;
        }
      }
    }
    if (text !== undefined) result.push({ text, notes });
  }
  return result;
}

export function detectFormat(data: unknown): "single" | "topic" | "invalid" {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "invalid";
  const obj = data as Record<string, unknown>;
  if (typeof obj["language"] === "string") return "single";
  if (Array.isArray(obj["versions"])) return "topic";
  return "invalid";
}

export function validateSingle(data: unknown): { result: LessonImportSingle | null; errors: ImportValidationError[] } {
  const errors: ImportValidationError[] = [];
  if (typeof data !== "object" || data === null) return { result: null, errors: [{ field: "root", message: "Expected an object" }] };
  const obj = data as Record<string, unknown>;

  const title = validateString(obj["title"], "title", { required: true, maxLen: 200 }, errors) ?? "";
  const description = obj["description"] !== undefined ? validateString(obj["description"], "description", { maxLen: 500 }, errors) : undefined;
  const language = validateString(obj["language"], "language", { required: true, maxLen: 10 }, errors) ?? "";
  const voice_name = obj["voice_name"] !== undefined ? validateString(obj["voice_name"], "voice_name", { maxLen: 100 }, errors) : undefined;
  const speed = typeof obj["speed"] === "number" ? obj["speed"] : undefined;
  const pitch = typeof obj["pitch"] === "number" ? obj["pitch"] : undefined;
  const sentences = validateSentences(obj["sentences"], "sentences", errors);
  const tags = Array.isArray(obj["tags"])
    ? (obj["tags"] as unknown[])
        .filter(t => typeof t === "string")
        .slice(0, MAX_TAGS)
        .map(t => (t as string).slice(0, MAX_TAG_LEN)) as string[]
    : undefined;

  if (errors.length > 0) return { result: null, errors };
  return { result: { format: "single", title, description, language, voice_name, speed, pitch, sentences, tags }, errors: [] };
}

export function validateTopic(data: unknown): { result: LessonImportTopic | null; errors: ImportValidationError[] } {
  const errors: ImportValidationError[] = [];
  if (typeof data !== "object" || data === null) return { result: null, errors: [{ field: "root", message: "Expected an object" }] };
  const obj = data as Record<string, unknown>;

  const title = validateString(obj["title"], "title", { required: true, maxLen: 200 }, errors) ?? "";
  const description = obj["description"] !== undefined ? validateString(obj["description"], "description", { maxLen: 500 }, errors) : undefined;

  if (!Array.isArray(obj["versions"]) || (obj["versions"] as unknown[]).length === 0) {
    errors.push({ field: "versions", message: "versions must be a non-empty array" });
    return { result: null, errors };
  }

  const versions: ImportVersion[] = [];
  for (let i = 0; i < (obj["versions"] as unknown[]).length; i++) {
    const v = (obj["versions"] as unknown[])[i] as Record<string, unknown>;
    if (typeof v !== "object" || v === null) { errors.push({ field: `versions[${i}]`, message: "Must be an object" }); continue; }
    const lang = validateString(v["language"], `versions[${i}].language`, { required: true, maxLen: 10 }, errors) ?? "";
    const versionTitle = v["title"] !== undefined ? validateString(v["title"], `versions[${i}].title`, { maxLen: 200 }, errors) : undefined;
    const versionDescription = v["description"] !== undefined ? validateString(v["description"], `versions[${i}].description`, { maxLen: 500 }, errors) : undefined;
    const voice_name = v["voice_name"] !== undefined ? validateString(v["voice_name"], `versions[${i}].voice_name`, { maxLen: 100 }, errors) : undefined;
    const speed = typeof v["speed"] === "number" ? v["speed"] : undefined;
    const pitch = typeof v["pitch"] === "number" ? v["pitch"] : undefined;
    const sentences = validateSentences(v["sentences"], `versions[${i}].sentences`, errors);
    if (lang) versions.push({ language: lang, title: versionTitle, description: versionDescription, voice_name, speed, pitch, sentences });
  }

  const tags = Array.isArray(obj["tags"])
    ? (obj["tags"] as unknown[])
        .filter(t => typeof t === "string")
        .slice(0, MAX_TAGS)
        .map(t => (t as string).slice(0, MAX_TAG_LEN)) as string[]
    : undefined;

  if (errors.length > 0) return { result: null, errors };
  return { result: { format: "topic", title, description, versions, tags }, errors: [] };
}

/**
 * Parse file content to a LessonImport.
 * @param yamlParse  Optional YAML parser — pass `yaml.load` from js-yaml on desktop; omit/undefined on CF (JSON-only)
 */
export function parseAndValidate(
  content: string,
  filename: string,
  yamlParse?: (s: string) => unknown
): ParseResult {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  let data: unknown;

  if ((ext === "yaml" || ext === "yml") && yamlParse) {
    try { data = yamlParse(content); }
    catch (e) { return { data: null, errors: [], parseError: `YAML parse error: ${(e as Error).message}` }; }
  } else {
    try { data = JSON.parse(content); }
    catch (e) { return { data: null, errors: [], parseError: `JSON parse error: ${(e as Error).message}` }; }
  }

  const format = detectFormat(data);
  if (format === "invalid") {
    return { data: null, errors: [{ field: "root", message: "Unrecognized format. Expected 'language' (single) or 'versions' array (topic)." }] };
  }

  if (format === "single") {
    const { result, errors } = validateSingle(data);
    return { data: result, errors };
  } else {
    const { result, errors } = validateTopic(data);
    return { data: result, errors };
  }
}

// ── DB write ──────────────────────────────────────────────────────────────────

export class ImportService {
  constructor(private db: IDatabase) {}

  async importLesson(
    lesson: LessonImport,
    existingTopicId: string | null,
    onDuplicate: "skip" | "error"
  ): Promise<ImportResult> {
    const auth = requireAuth();

    // ── Resolve or create topic ID ─────────────────────────────────────────
    let topicId: string;
    if (existingTopicId) {
      const t = await this.db.queryFirst<{ id: string }>(
        "SELECT id FROM topics WHERE id = ?", existingTopicId
      );
      if (!t) throw new NotFoundError(`Topic '${existingTopicId}' not found`);
      topicId = existingTopicId;
    } else {
      topicId = crypto.randomUUID();
    }

    // ── Normalise to versions array ────────────────────────────────────────
    const versions: ImportVersion[] = lesson.format === "single"
      ? [{ language: lesson.language, title: undefined, description: undefined, voice_name: lesson.voice_name, speed: lesson.speed, pitch: lesson.pitch, sentences: lesson.sentences }]
      : lesson.versions;

    // ── Duplicate check (needs DB read before batch) ───────────────────────
    const langCodes = versions.map(v => v.language);
    const existingVersions = existingTopicId
      ? await this.db.queryAll<{ language_code: string }>(
          `SELECT language_code FROM topic_language_versions WHERE topic_id = ? AND language_code IN (${langCodes.map(() => "?").join(",")})`,
          existingTopicId, ...langCodes
        )
      : [];
    const existingLangs = new Set(existingVersions.map(v => v.language_code));

    for (const v of versions) {
      if (existingLangs.has(v.language)) {
        if (onDuplicate === "error") throw new ConflictError(`Language '${v.language}' already exists on this topic`);
      }
    }

    // ── Tag lookups (SELECT — must happen before batch) ────────────────────
    let tagIds: string[] = [];
    if (lesson.tags && lesson.tags.length > 0) {
      const tagRows = await this.db.queryAll<{ id: string }>(
        `SELECT id FROM tags WHERE name IN (${lesson.tags.map(() => "?").join(",")})`,
        ...lesson.tags
      );
      tagIds = tagRows.map(t => t.id);
    }

    // ── Compute next version position offset ───────────────────────────────
    const maxPosRow = await this.db.queryFirst<{ m: number }>(
      "SELECT COALESCE(MAX(position), -1) as m FROM topic_language_versions WHERE topic_id = ?", topicId
    );
    let posOffset = (maxPosRow?.m ?? -1) + 1;

    // ── Build all INSERT statements upfront ────────────────────────────────
    const statements: { sql: string; params: unknown[] }[] = [];

    // Topic INSERT (only if new)
    if (!existingTopicId) {
      statements.push({
        sql: "INSERT INTO topics (id, owner_id, title, description) VALUES (?, ?, ?, ?)",
        params: [topicId, auth.id, lesson.title, (lesson as LessonImportTopic).description ?? null],
      });
    }

    // Track results for return value
    const versionsResult: ImportResult["versions"] = [];
    let totalSentences = 0;
    const importedLangCodes: string[] = [];

    for (const v of versions) {
      // Skip duplicates (already validated above for "error" mode)
      if (existingLangs.has(v.language)) continue;

      const versionId = crypto.randomUUID();

      statements.push({
        sql: `INSERT INTO topic_language_versions
              (id, topic_id, language_code, title, description, voice_name, speed, pitch, position)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          versionId, topicId, v.language,
          v.title ?? null, v.description ?? null,
          v.voice_name ?? null, v.speed ?? null, v.pitch ?? null,
          posOffset++,
        ],
      });

      for (let i = 0; i < v.sentences.length; i++) {
        const s = v.sentences[i]!;
        statements.push({
          sql: "INSERT INTO sentences (id, version_id, text, notes, position) VALUES (?, ?, ?, ?, ?)",
          params: [crypto.randomUUID(), versionId, s.text, s.notes ? JSON.stringify(s.notes) : null, i],
        });
      }

      versionsResult.push({ versionId, language: v.language, sentenceCount: v.sentences.length });
      totalSentences += v.sentences.length;
      importedLangCodes.push(v.language.split("-")[0]!.toLowerCase());
    }

    // Topic tag links
    for (const tagId of tagIds) {
      statements.push({
        sql: "INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)",
        params: [topicId, tagId],
      });
    }

    // Auto language tags
    if (importedLangCodes.length > 0) {
      const uniqueCodes = [...new Set(importedLangCodes)];
      const langTagRows = await this.db.queryAll<{ id: string }>(
        `SELECT id FROM tags WHERE type = 'language' AND name IN (${uniqueCodes.map(() => "?").join(",")})`,
        ...uniqueCodes
      );
      for (const tag of langTagRows) {
        statements.push({
          sql: "INSERT OR IGNORE INTO topic_tags (topic_id, tag_id) VALUES (?, ?)",
          params: [topicId, tag.id],
        });
      }
    }

    // ── Single batch round-trip ────────────────────────────────────────────
    if (statements.length > 0) {
      await this.db.batch(statements);
    }

    const topic = await this.db.queryFirst<{ id: string; title: string }>(
      "SELECT id, title FROM topics WHERE id = ?", topicId
    );

    return { topic: topic!, versions: versionsResult, totalSentences };
  }
}
