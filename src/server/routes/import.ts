import { json, error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { ImportService, parseAndValidate } from "../../core/services/import.service";
import { NotFoundError, ConflictError } from "../../core/errors";
import * as yaml from "js-yaml";

function svc() { return new ImportService(dbAdapter); }

async function readMultipartFile(req: Request): Promise<{ content: string; filename: string } | null> {
  let formData: Awaited<ReturnType<Request["formData"]>>;
  try { formData = await req.formData(); } catch { return null; }

  const file = formData.get("file") as File | string | null;
  if (!file) return null;
  if (typeof file === "string") return { content: file, filename: "import.json" };
  // File object (Bun/browser)
  const f = file as unknown as { text(): Promise<string>; name: string };
  return { content: await f.text(), filename: f.name };
}

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (method === "POST" && path === "/api/import/preview") return handlePreview(req);
  if (method === "POST" && path === "/api/import")         return handleImport(req, url);

  return error("not found", 404);
}

async function handlePreview(req: Request): Promise<Response> {
  const file = await readMultipartFile(req);
  if (!file) return error("No file uploaded", 400);

  const result = parseAndValidate(file.content, file.filename, yaml.load);

  if (result.parseError) {
    return json({ ok: false, parseError: result.parseError, errors: [], format: null, title: null, description: null, versions: [] });
  }
  if (result.errors.length > 0 || !result.data) {
    return json({ ok: false, parseError: null, errors: result.errors, format: null, title: null, description: null, versions: [] });
  }

  const data = result.data;
  if (data.format === "single") {
    return json({ ok: true, parseError: null, errors: [], format: "single", title: data.title, description: data.description ?? null, versions: [{ language: data.language, sentenceCount: data.sentences.length }] });
  } else {
    return json({ ok: true, parseError: null, errors: [], format: "topic", title: data.title, description: data.description ?? null, versions: data.versions.map(v => ({ language: v.language, sentenceCount: v.sentences.length })) });
  }
}

async function handleImport(req: Request, url: URL): Promise<Response> {
  const file = await readMultipartFile(req);
  if (!file) return error("No file uploaded", 400);

  const result = parseAndValidate(file.content, file.filename, yaml.load);
  if (result.parseError) return error(result.parseError, 400);
  if (result.errors.length > 0 || !result.data) return json({ error: "Validation failed", details: result.errors }, 400);

  const existingTopicId = url.searchParams.get("topic_id") ?? null;
  const onDuplicate = (url.searchParams.get("onDuplicate") ?? "skip") as "skip" | "error";

  try {
    const importResult = await svc().importLesson(result.data, existingTopicId, onDuplicate);
    return json(importResult, 201);
  } catch (e) {
    if (e instanceof NotFoundError) return error(e.message, 404);
    if (e instanceof ConflictError) return error(e.message, 409);
    throw e;
  }
}
