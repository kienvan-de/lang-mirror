import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

// ── /api/versions/:id ────────────────────────────────────────────────────────
// Mounted at /api/versions in app.ts

export const versionsRouter = new Hono<{ Bindings: Env }>();

versionsRouter.get("/:id", async (c) => {
  const { versions } = buildContext(c.env);
  return c.json(await versions.get(c.req.param("id")));
});

versionsRouter.put("/:id", async (c) => {
  const body = await c.req.json();
  const { versions } = buildContext(c.env);
  return c.json(await versions.update(c.req.param("id"), body));
});

versionsRouter.delete("/:id", async (c) => {
  const { versions } = buildContext(c.env);
  await versions.delete(c.req.param("id"));
  return c.json({ deleted: true });
});

versionsRouter.get("/:id/sentences", async (c) => {
  const { versions } = buildContext(c.env);
  return c.json(await versions.listSentences(c.req.param("id")));
});

versionsRouter.post("/:id/sentences", async (c) => {
  const body = await c.req.json();
  const { versions } = buildContext(c.env);
  return c.json(await versions.createSentence(c.req.param("id"), body), 201);
});

versionsRouter.post("/:id/sentences/reorder", async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const { versions } = buildContext(c.env);
  return c.json(await versions.reorderSentences(c.req.param("id"), ids));
});
