import * as yaml from "js-yaml";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ImportSentence {
  text: string;
  notes?: string;
}

export interface ImportVersion {
  language: string;
  voice_name?: string;
  speed?: number;
  pitch?: number;
  sentences: ImportSentence[];
}

/** Format A: single language version */
export interface LessonImportSingle {
  format: "single";
  title: string;
  description?: string;
  language: string;
  voice_name?: string;
  speed?: number;
  pitch?: number;
  sentences: ImportSentence[];
}

/** Format B: multi-language topic */
export interface LessonImportTopic {
  format: "topic";
  title: string;
  description?: string;
  versions: ImportVersion[];
}

export type LessonImport = LessonImportSingle | LessonImportTopic;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ParseResult {
  data: LessonImport | null;
  errors: ValidationError[];
  parseError?: string;
}

// ── Format detection ──────────────────────────────────────────────────────────

export function detectFormat(data: unknown): "single" | "topic" | "invalid" {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "invalid";
  const obj = data as Record<string, unknown>;
  if (typeof obj["language"] === "string") return "single";
  if (Array.isArray(obj["versions"])) return "topic";
  return "invalid";
}

// ── Validators ────────────────────────────────────────────────────────────────

function validateString(
  val: unknown,
  field: string,
  opts: { required?: boolean; maxLen?: number },
  errors: ValidationError[]
): string | undefined {
  if (val === undefined || val === null || val === "") {
    if (opts.required) errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (typeof val !== "string") {
    errors.push({ field, message: `${field} must be a string` });
    return undefined;
  }
  if (opts.maxLen && val.length > opts.maxLen) {
    errors.push({ field, message: `${field} must be at most ${opts.maxLen} characters` });
  }
  return val;
}

function validateSentences(
  raw: unknown,
  field: string,
  errors: ValidationError[]
): ImportSentence[] {
  if (!Array.isArray(raw)) {
    errors.push({ field, message: `${field} must be an array` });
    return [];
  }
  if (raw.length === 0) {
    errors.push({ field, message: `${field} must have at least 1 sentence` });
    return [];
  }
  if (raw.length > 500) {
    errors.push({ field, message: `${field} must have at most 500 sentences` });
  }
  const result: ImportSentence[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] as Record<string, unknown>;
    if (typeof s !== "object" || s === null) {
      errors.push({ field: `${field}[${i}]`, message: "Must be an object" });
      continue;
    }
    const text = validateString(s["text"], `${field}[${i}].text`, { required: true, maxLen: 2000 }, errors);
    const notes = s["notes"] !== undefined && s["notes"] !== null
      ? validateString(s["notes"], `${field}[${i}].notes`, { maxLen: 500 }, errors)
      : undefined;
    if (text !== undefined) {
      result.push({ text, notes });
    }
  }
  return result;
}

export function validateSingle(data: unknown): { result: LessonImportSingle | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (typeof data !== "object" || data === null) {
    return { result: null, errors: [{ field: "root", message: "Expected an object" }] };
  }
  const obj = data as Record<string, unknown>;

  const title = validateString(obj["title"], "title", { required: true, maxLen: 200 }, errors) ?? "";
  const description = obj["description"] !== undefined
    ? validateString(obj["description"], "description", { maxLen: 500 }, errors)
    : undefined;
  const language = validateString(obj["language"], "language", { required: true, maxLen: 10 }, errors) ?? "";
  if (language && !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(language)) {
    errors.push({ field: "language", message: "Invalid language code format" });
  }
  const voice_name = obj["voice_name"] !== undefined
    ? validateString(obj["voice_name"], "voice_name", { maxLen: 100 }, errors)
    : undefined;
  const speed = typeof obj["speed"] === "number" ? obj["speed"] : undefined;
  const pitch = typeof obj["pitch"] === "number" ? obj["pitch"] : undefined;
  const sentences = validateSentences(obj["sentences"], "sentences", errors);

  if (errors.length > 0) return { result: null, errors };
  return {
    result: { format: "single", title, description, language, voice_name, speed, pitch, sentences },
    errors: [],
  };
}

export function validateTopic(data: unknown): { result: LessonImportTopic | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (typeof data !== "object" || data === null) {
    return { result: null, errors: [{ field: "root", message: "Expected an object" }] };
  }
  const obj = data as Record<string, unknown>;

  const title = validateString(obj["title"], "title", { required: true, maxLen: 200 }, errors) ?? "";
  const description = obj["description"] !== undefined
    ? validateString(obj["description"], "description", { maxLen: 500 }, errors)
    : undefined;

  if (!Array.isArray(obj["versions"]) || obj["versions"].length === 0) {
    errors.push({ field: "versions", message: "versions must be a non-empty array" });
    return { result: null, errors };
  }

  const versions: ImportVersion[] = [];
  for (let i = 0; i < (obj["versions"] as unknown[]).length; i++) {
    const v = (obj["versions"] as unknown[])[i] as Record<string, unknown>;
    if (typeof v !== "object" || v === null) {
      errors.push({ field: `versions[${i}]`, message: "Must be an object" });
      continue;
    }
    const lang = validateString(v["language"], `versions[${i}].language`, { required: true, maxLen: 10 }, errors) ?? "";
    if (lang && !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(lang)) {
      errors.push({ field: `versions[${i}].language`, message: "Invalid language code format" });
    }
    const voice_name = v["voice_name"] !== undefined
      ? validateString(v["voice_name"], `versions[${i}].voice_name`, { maxLen: 100 }, errors)
      : undefined;
    const speed = typeof v["speed"] === "number" ? v["speed"] : undefined;
    const pitch = typeof v["pitch"] === "number" ? v["pitch"] : undefined;
    const sentences = validateSentences(v["sentences"], `versions[${i}].sentences`, errors);
    if (lang) {
      versions.push({ language: lang, voice_name, speed, pitch, sentences });
    }
  }

  if (errors.length > 0) return { result: null, errors };
  return {
    result: { format: "topic", title, description, versions },
    errors: [],
  };
}

// ── File parsing (JSON + YAML) ────────────────────────────────────────────────

export function parseFileContent(content: string, filename: string): { data: unknown; parseError?: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "yaml" || ext === "yml") {
    try {
      const data = yaml.load(content);
      return { data };
    } catch (e) {
      return { data: null, parseError: `YAML parse error: ${(e as Error).message}` };
    }
  }
  // Default: JSON (also fallback for unknown extensions)
  try {
    return { data: JSON.parse(content) };
  } catch (e) {
    return { data: null, parseError: `JSON parse error: ${(e as Error).message}` };
  }
}

// ── Full parse + validate ─────────────────────────────────────────────────────

export function parseAndValidate(content: string, filename: string): ParseResult {
  const { data, parseError } = parseFileContent(content, filename);
  if (parseError || data === null) {
    return { data: null, errors: [], parseError: parseError ?? "Could not parse file" };
  }

  const format = detectFormat(data);
  if (format === "invalid") {
    return {
      data: null,
      errors: [{ field: "root", message: "Unrecognized format. Expected 'language' field (single) or 'versions' array (topic)." }],
    };
  }

  if (format === "single") {
    const { result, errors } = validateSingle(data);
    return { data: result, errors };
  } else {
    const { result, errors } = validateTopic(data);
    return { data: result, errors };
  }
}
