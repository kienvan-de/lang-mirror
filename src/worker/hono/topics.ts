import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

// ── /api/topics ───────────────────────────────────────────────────────────────
// Mounted at /api/topics in app.ts

export const topicsRouter = new Hono<{ Bindings: Env }>();

topicsRouter.get("/", async (c) => {
  const { topics } = buildContext(c.env);
  return c.json(await topics.list());
});

topicsRouter.post("/", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string }>();
  const { topics } = buildContext(c.env);
  return c.json(await topics.create(body.title ?? "", body.description), 201);
});

topicsRouter.get("/:id", async (c) => {
  const { topics } = buildContext(c.env);
  return c.json(await topics.get(c.req.param("id")));
});

topicsRouter.put("/:id", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string }>();
  const { topics } = buildContext(c.env);
  return c.json(await topics.update(c.req.param("id"), body));
});

topicsRouter.delete("/:id", async (c) => {
  const { topics } = buildContext(c.env);
  await topics.delete(c.req.param("id"));
  return c.json({ deleted: true });
});

// ── /api/topics/:topicId/versions ─────────────────────────────────────────────

topicsRouter.get("/:topicId/versions", async (c) => {
  const { versions } = buildContext(c.env);
  return c.json(await versions.listByTopic(c.req.param("topicId")));
});

topicsRouter.post("/:topicId/versions", async (c) => {
  const body = await c.req.json<{
    language_code?: string;
    title?: string;
    description?: string;
    voice_name?: string;
    speed?: number;
    pitch?: number;
  }>();
  const { versions } = buildContext(c.env);
  return c.json(await versions.create(c.req.param("topicId"), {
    language_code: typeof body.language_code === "string" ? body.language_code : "",
    title:         typeof body.title         === "string" ? body.title         : undefined,
    description:   typeof body.description   === "string" ? body.description   : undefined,
    voice_name:    typeof body.voice_name    === "string" ? body.voice_name    : undefined,
    speed:         typeof body.speed         === "number" ? body.speed         : undefined,
    pitch:         typeof body.pitch         === "number" ? body.pitch         : undefined,
  }), 201);
});

topicsRouter.post("/:topicId/versions/reorder", async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const { versions } = buildContext(c.env);
  return c.json(await versions.reorder(c.req.param("topicId"), ids));
});

// ── /api/topics/:topicId/tags ─────────────────────────────────────────────────

// PUT /api/topics/:topicId/tags — replace all tags on a topic (owner only)
topicsRouter.put("/:topicId/tags", async (c) => {
  const { tagIds } = await c.req.json<{ tagIds: string[] }>();
  const { topics } = buildContext(c.env);
  return c.json(await topics.setTags(c.req.param("topicId"), tagIds ?? []));
});
