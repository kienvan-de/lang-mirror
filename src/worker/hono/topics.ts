import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

// ── /api/topics ───────────────────────────────────────────────────────────────
// Mounted at /api/topics in app.ts

export const topicsRouter = new Hono<{ Bindings: Env }>();

topicsRouter.get("/", async (c) => {
  const { topics } = await buildContext(c.env);
  return c.json(await topics.list());
});

topicsRouter.post("/", async (c) => {
  const body = await c.req.json<{ title?: string; description?: string }>();
  const { topics } = await buildContext(c.env);
  return c.json(await topics.create(body.title ?? "", body.description), 201);
});

// GET /api/topics/admin/all — admin only, returns all topics with owner info
topicsRouter.get("/admin/all", adminGuard, async (c) => {
  const { topics } = await buildContext(c.env);
  return c.json(await topics.adminList());
});

// POST /api/topics/:id/submit — owner submits topic for review
topicsRouter.post("/:id/submit", validateUuidParam("id"), async (c) => {
  const body = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
  const { topics } = await buildContext(c.env);
  return c.json(await topics.submitForReview(c.req.param("id")!, body.note), 201);
});

// DELETE /api/topics/:id/submit — owner withdraws pending request
topicsRouter.delete("/:id/submit", validateUuidParam("id"), async (c) => {
  const { topics } = await buildContext(c.env);
  await topics.withdrawRequest(c.req.param("id")!);
  return new Response(null, { status: 204 });
});

// PUT /api/topics/:id/unpublish — admin directly unpublishes (emergency)
topicsRouter.put("/:id/unpublish", adminGuard, validateUuidParam("id"), async (c) => {
  const { topics } = await buildContext(c.env);
  return c.json(await topics.unpublish(c.req.param("id")!));
});

topicsRouter.get("/:id", validateUuidParam("id"), async (c) => {
  const { topics } = await buildContext(c.env);
  return c.json(await topics.get(c.req.param("id")));
});

topicsRouter.put("/:id", validateUuidParam("id"), async (c) => {
  const body = await c.req.json<{ title?: string; description?: string }>();
  const { topics } = await buildContext(c.env);
  return c.json(await topics.update(c.req.param("id"), body));
});

topicsRouter.delete("/:id", validateUuidParam("id"), async (c) => {
  const { topics } = await buildContext(c.env);
  await topics.delete(c.req.param("id"));
  return c.json({ deleted: true });
});

// ── /api/topics/:topicId/versions ─────────────────────────────────────────────

topicsRouter.get("/:topicId/versions", async (c) => {
  const { versions } = await buildContext(c.env);
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
  const { versions } = await buildContext(c.env);
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
  const { versions } = await buildContext(c.env);
  return c.json(await versions.reorder(c.req.param("topicId"), ids));
});

// ── /api/topics/:topicId/tags ─────────────────────────────────────────────────

// PUT /api/topics/:topicId/tags — replace all tags on a topic (owner only)
topicsRouter.put("/:topicId/tags", async (c) => {
  const { tagIds } = await c.req.json<{ tagIds: string[] }>();
  const { topics } = await buildContext(c.env);
  return c.json(await topics.setTags(c.req.param("topicId"), tagIds ?? []));
});
