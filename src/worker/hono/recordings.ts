import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import type { Env } from "../types";

export const recordingsRouter = new Hono<{ Bindings: Env }>();

// DELETE /api/recordings — delete all (admin only)
recordingsRouter.delete("/", adminGuard, async (c) => {
  const { recordings } = buildContext(c.env);
  return c.json(await recordings.deleteAll());
});

// POST /api/recordings/:sentenceId
recordingsRouter.post("/:sentenceId", async (c) => {
  const contentType = c.req.header("Content-Type") ?? "audio/webm";
  const { recordings } = buildContext(c.env);
  const result = await recordings.upload(
    c.req.param("sentenceId"),
    c.req.raw.body!,
    contentType
  );
  return c.json(result, 201);
});

// GET /api/recordings/:sentenceId
recordingsRouter.get("/:sentenceId", async (c) => {
  const { recordings } = buildContext(c.env);
  const ref = await recordings.get(c.req.param("sentenceId"));
  return new Response(ref.object.body, {
    headers: {
      "Content-Type": ref.contentType,
      "Cache-Control": "no-store",
    },
  });
});

// DELETE /api/recordings/:sentenceId
recordingsRouter.delete("/:sentenceId", async (c) => {
  const { recordings } = buildContext(c.env);
  await recordings.delete(c.req.param("sentenceId"));
  return new Response(null, { status: 204 });
});
