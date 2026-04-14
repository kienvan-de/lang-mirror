import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

// ── /api/versions/:id ────────────────────────────────────────────────────────
// Mounted at /api/versions in app.ts

export const versionsRouter = new Hono<{ Bindings: Env }>();

versionsRouter.get("/:id", validateUuidParam("id"), async (c) => {
  const { versions } = await buildContext(c.env);
  return c.json(await versions.get(c.req.param("id")!));
});

versionsRouter.put("/:id", validateUuidParam("id"), async (c) => {
  const body = await c.req.json<{
    title?: string | null;
    description?: string | null;
    voice_name?: string | null;
    speed?: number | null;
    pitch?: number | null;
  }>();
  const { versions } = await buildContext(c.env);
  // Explicitly allowlist fields — never pass raw body to service
  return c.json(await versions.update(c.req.param("id")!, {
    title:       body.title !== undefined ? body.title : undefined,
    description: body.description !== undefined ? body.description : undefined,
    voice_name:  body.voice_name !== undefined ? body.voice_name : undefined,
    speed:       typeof body.speed === "number" || body.speed === null ? body.speed : undefined,
    pitch:       typeof body.pitch === "number" || body.pitch === null ? body.pitch : undefined,
  }));
});

versionsRouter.delete("/:id", validateUuidParam("id"), async (c) => {
  const { versions } = await buildContext(c.env);
  await versions.delete(c.req.param("id")!);
  return c.json({ deleted: true });
});

versionsRouter.get("/:id/sentences", validateUuidParam("id"), async (c) => {
  const { versions } = await buildContext(c.env);
  return c.json(await versions.listSentences(c.req.param("id")!));
});

versionsRouter.post("/:id/sentences", validateUuidParam("id"), async (c) => {
  const body = await c.req.json();
  const { versions } = await buildContext(c.env);
  return c.json(await versions.createSentence(c.req.param("id")!, body), 201);
});

versionsRouter.post("/:id/sentences/reorder", validateUuidParam("id"), async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  const { versions } = await buildContext(c.env);
  return c.json(await versions.reorderSentences(c.req.param("id")!, ids));
});
