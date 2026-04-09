import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

export const versionsRouter = new Hono<{ Bindings: Env }>();

// ── /api/topics/:topicId/versions ────────────────────────────────────────────

versionsRouter.get("/topics/:topicId/versions", async (c) => {
  const { versions } = buildContext(c.env);
  return c.json(await versions.listByTopic(c.req.param("topicId")));
});

versionsRouter.post("/topics/:topicId/versions", async (c) => {
  const body = await c.req.json();
  const { versions } = buildContext(c.env);
  return c.json(await versions.create(c.req.param("topicId"), body), 201);
});

versionsRouter.post("/topics/:topicId/versions/reorder", async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const { versions } = buildContext(c.env);
  return c.json(await versions.reorder(c.req.param("topicId"), ids));
});

// ── /api/versions/:id ─────────────────────────────────────────────────────────

versionsRouter.get("/versions/:id", async (c) => {
  const { versions } = buildContext(c.env);
  return c.json(await versions.get(c.req.param("id")));
});

versionsRouter.put("/versions/:id", async (c) => {
  const body = await c.req.json();
  const { versions } = buildContext(c.env);
  return c.json(await versions.update(c.req.param("id"), body));
});

versionsRouter.delete("/versions/:id", async (c) => {
  const { versions } = buildContext(c.env);
  await versions.delete(c.req.param("id"));
  return c.json({ deleted: true });
});

// ── /api/versions/:id/sentences ───────────────────────────────────────────────

versionsRouter.get("/versions/:id/sentences", async (c) => {
  const { versions } = buildContext(c.env);
  return c.json(await versions.listSentences(c.req.param("id")));
});

versionsRouter.post("/versions/:id/sentences", async (c) => {
  const body = await c.req.json();
  const { versions } = buildContext(c.env);
  return c.json(await versions.createSentence(c.req.param("id"), body), 201);
});

versionsRouter.post("/versions/:id/sentences/reorder", async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const { versions } = buildContext(c.env);
  return c.json(await versions.reorderSentences(c.req.param("id"), ids));
});
