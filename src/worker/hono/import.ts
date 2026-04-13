import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { parseAndValidate } from "../../core/services/import.service";
import { isValidUuid } from "./middleware/validate";
import { importRateLimit } from "./middleware/rate-limit";
import type { Env } from "../types";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

export const importRouter = new Hono<{ Bindings: Env }>();

// Apply rate limiting to all import routes: 20 req / 60 s per authenticated user
importRouter.use("*", importRateLimit);

async function readFile(req: Request): Promise<{ content: string; filename: string } | null> {
  let formData: FormData;
  try { formData = await req.formData(); } catch { return null; }

  const entry = formData.get("file");
  if (!entry) return null;
  if (entry instanceof File) {
    // Authoritative body-size check — entry.size is the actual decoded byte count,
    // not the client-supplied Content-Length header which is untrusted.
    if (entry.size > MAX_IMPORT_BYTES) throw new Error("Import file exceeds 5 MB limit");
    return { content: await entry.text(), filename: entry.name };
  }
  if (typeof entry === "string") {
    if (entry.length > MAX_IMPORT_BYTES) throw new Error("Import file exceeds 5 MB limit");
    return { content: entry, filename: "import.json" };
  }
  return null;
}

// POST /api/import/preview
importRouter.post("/preview", async (c) => {
  // Content-Length is a best-effort early hint only — it is client-supplied and
  // can be omitted or spoofed. The authoritative size check is inside readFile().
  const cl = parseInt(c.req.header("Content-Length") ?? "0", 10);
  if (!isNaN(cl) && cl > MAX_IMPORT_BYTES) return c.json({ error: "Import file exceeds 5 MB limit" }, 413);

  let file: { content: string; filename: string } | null;
  try { file = await readFile(c.req.raw); } catch (e) { return c.json({ error: (e as Error).message }, 413); }
  if (!file) return c.json({ error: "No file uploaded" }, 400);

  const result = parseAndValidate(file.content, file.filename);

  if (result.parseError) {
    return c.json({ ok: false, parseError: result.parseError, errors: [], format: null, title: null, description: null, versions: [] });
  }
  if (result.errors.length > 0 || !result.data) {
    return c.json({ ok: false, parseError: null, errors: result.errors, format: null, title: null, description: null, versions: [] });
  }

  const data = result.data;
  if (data.format === "single") {
    return c.json({ ok: true, parseError: null, errors: [], format: "single", title: data.title, description: data.description ?? null, tags: data.tags ?? [], versions: [{ language: data.language, sentenceCount: data.sentences.length }] });
  } else {
    return c.json({ ok: true, parseError: null, errors: [], format: "topic", title: data.title, description: data.description ?? null, tags: data.tags ?? [], versions: data.versions.map(v => ({ language: v.language, sentenceCount: v.sentences.length })) });
  }
});

// POST /api/import
//
// Query params:
//   topic_id    (optional) UUID — append versions into an existing topic the caller owns.
//               If omitted a new topic is created.
//   onDuplicate (optional) "skip" (default) | "error"
//               "skip"  — silently ignores language versions that already exist on the topic.
//               "error" — returns 409 if any language version already exists.
importRouter.post("/", async (c) => {
  // Content-Length is a best-effort early hint only — see readFile() for the
  // authoritative body-size check.
  const cl = parseInt(c.req.header("Content-Length") ?? "0", 10);
  if (!isNaN(cl) && cl > MAX_IMPORT_BYTES) return c.json({ error: "Import file exceeds 5 MB limit" }, 413);

  let file: { content: string; filename: string } | null;
  try { file = await readFile(c.req.raw); } catch (e) { return c.json({ error: (e as Error).message }, 413); }
  if (!file) return c.json({ error: "No file uploaded" }, 400);

  const result = parseAndValidate(file.content, file.filename);
  if (result.parseError) return c.json({ error: result.parseError }, 400);
  if (result.errors.length > 0 || !result.data) return c.json({ error: "Validation failed", details: result.errors }, 400);

  // ── Validate topic_id — must be a well-formed UUID if supplied ──────────────
  const rawTopicId = c.req.query("topic_id") ?? null;
  if (rawTopicId !== null && !isValidUuid(rawTopicId)) {
    return c.json({ error: "Invalid topic_id" }, 400);
  }
  const existingTopicId = rawTopicId;

  // ── onDuplicate: default is "skip" (never silently error on missing param) ──
  const rawDuplicate = c.req.query("onDuplicate") ?? "skip";
  const onDuplicate: "skip" | "error" = rawDuplicate === "error" ? "error" : "skip";

  const { importer } = await buildContext(c.env);
  const importResult = await importer.importLesson(result.data, existingTopicId, onDuplicate);
  return c.json(importResult, 201);
});
