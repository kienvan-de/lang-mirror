import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

export const pathsRouter = new Hono<{ Bindings: Env }>();

// GET /api/path — get or create user's path
pathsRouter.get("/", async (c) => {
  const { paths } = await buildContext(c.env);
  return c.json(await paths.getOrCreate());
});

// GET /api/path/search?q= — search other users' paths
pathsRouter.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const { paths } = await buildContext(c.env);
  return c.json(await paths.search(q));
});

// PUT /api/path/:id — update path name/description
pathsRouter.put("/:id", validateUuidParam("id"), async (c) => {
  const body = await c.req.json<{ name?: string; description?: string }>();
  const { paths } = await buildContext(c.env);
  return c.json(await paths.update(c.req.param("id")!, body));
});

// POST /api/path/:id/topics — add topic to path
pathsRouter.post("/:id/topics", validateUuidParam("id"), async (c) => {
  const { topicId } = await c.req.json<{ topicId: string }>();
  const { paths } = await buildContext(c.env);
  return c.json(await paths.addTopic(c.req.param("id")!, topicId));
});

// DELETE /api/path/:id/topics/:topicId — remove topic from path
pathsRouter.delete("/:id/topics/:topicId", validateUuidParam("id"), async (c) => {
  const { paths } = await buildContext(c.env);
  return c.json(await paths.removeTopic(c.req.param("id")!, c.req.param("topicId")!));
});

// POST /api/path/:id/topics/reorder — reorder topics
pathsRouter.post("/:id/topics/reorder", validateUuidParam("id"), async (c) => {
  const { topicIds } = await c.req.json<{ topicIds: string[] }>();
  const { paths } = await buildContext(c.env);
  return c.json(await paths.reorderTopics(c.req.param("id")!, topicIds));
});

// POST /api/path/:id/copy — copy path into caller's path
pathsRouter.post("/:id/copy", validateUuidParam("id"), async (c) => {
  const { paths } = await buildContext(c.env);
  return c.json(await paths.copy(c.req.param("id")!));
});
