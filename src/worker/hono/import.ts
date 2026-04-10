import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { parseAndValidate } from "../../core/services/import.service";
import type { Env } from "../types";

export const importRouter = new Hono<{ Bindings: Env }>();

async function readFile(req: Request): Promise<{ content: string; filename: string } | null> {
  let formData: FormData;
  try { formData = await req.formData(); } catch { return null; }

  const entry = formData.get("file");
  if (!entry) return null;
  if (entry instanceof File) return { content: await entry.text(), filename: entry.name };
  if (typeof entry === "string") return { content: entry, filename: "import.json" };
  return null;
}

// POST /api/import/preview
importRouter.post("/preview", async (c) => {
  const file = await readFile(c.req.raw);
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
importRouter.post("/", async (c) => {
  const file = await readFile(c.req.raw);
  if (!file) return c.json({ error: "No file uploaded" }, 400);

  const result = parseAndValidate(file.content, file.filename);
  if (result.parseError) return c.json({ error: result.parseError }, 400);
  if (result.errors.length > 0 || !result.data) return c.json({ error: "Validation failed", details: result.errors }, 400);

  const existingTopicId = c.req.query("topic_id") ?? null;
  const onDuplicate = (c.req.query("onDuplicate") ?? "skip") as "skip" | "error";

  const { importer } = buildContext(c.env);
  const importResult = await importer.importLesson(result.data, existingTopicId, onDuplicate);
  return c.json(importResult, 201);
});
