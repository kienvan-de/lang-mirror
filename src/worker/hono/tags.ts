import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

export const tagsRouter = new Hono<{ Bindings: Env }>();

// GET /api/tags — all authenticated users
tagsRouter.get("/", async (c) => {
  const { tags } = await buildContext(c.env);
  return c.json(await tags.list());
});

// POST /api/tags — admin only
tagsRouter.post("/", adminGuard, async (c) => {
  const body = await c.req.json<{ type?: string; name: string; color?: string }>();
  const { tags } = await buildContext(c.env);
  return c.json(await tags.create(body), 201);
});

// PUT /api/tags/:id — admin only
tagsRouter.put("/:id", adminGuard, validateUuidParam("id"), async (c) => {
  const body = await c.req.json<{ name?: string; color?: string; type?: string }>();
  const { tags } = await buildContext(c.env);
  return c.json(await tags.update(c.req.param("id"), body));
});

// DELETE /api/tags/:id — admin only
tagsRouter.delete("/:id", adminGuard, validateUuidParam("id"), async (c) => {
  const { tags } = await buildContext(c.env);
  await tags.delete(c.req.param("id"));
  return c.json({ deleted: true });
});
