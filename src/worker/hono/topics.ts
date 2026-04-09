import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

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
