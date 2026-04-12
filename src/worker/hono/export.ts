import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import type { Env } from "../types";

export const exportRouter = new Hono<{ Bindings: Env }>();

// GET /api/export/all (admin only)
exportRouter.get("/all", adminGuard, async (c) => {
  const { exporter } = await buildContext(c.env);
  const bundle = await exporter.exportAll();
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lang-mirror-export.json"`,
    },
  });
});

// GET /api/export/:topicId
exportRouter.get("/:topicId", async (c) => {
  const { exporter } = await buildContext(c.env);
  const { payload, filename } = await exporter.exportTopic(c.req.param("topicId"));
  // Sanitise filename: strip quotes, backslashes and non-ASCII to prevent header injection
  const safeFilename = filename.replace(/[^\w\s\-\.]/g, "_").replace(/\s+/g, "_").slice(0, 100);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
});
