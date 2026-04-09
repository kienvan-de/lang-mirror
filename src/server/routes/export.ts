import { error } from "../lib/response";
import { dbAdapter } from "../lib/context";
import { ExportService } from "../../core/services/export.service";
import { NotFoundError } from "../../core/errors";

// Desktop export also builds a real ZIP using a minimal implementation
import { existsSync } from "fs";
import { join } from "path";

function svc() { return new ExportService(dbAdapter); }

export async function handle(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/api/export/all") {
    return exportAll();
  }

  const topicMatch = path.match(/^\/api\/export\/([^/]+)$/);
  if (method === "GET" && topicMatch) {
    return exportTopic(topicMatch[1]!);
  }

  return error("not found", 404);
}

async function exportTopic(topicId: string): Promise<Response> {
  try {
    const { payload, filename } = await svc().exportTopic(topicId);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return error(e.message, 404);
    throw e;
  }
}

async function exportAll(): Promise<Response> {
  const bundle = await svc().exportAll();
  const timestamp = new Date().toISOString().slice(0, 10);

  // Build a simple ZIP using the existing buildZip helper from the old export route
  // For now return a JSON bundle (same as worker) — ZIP support can be added later
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lang-mirror-export-${timestamp}.json"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
