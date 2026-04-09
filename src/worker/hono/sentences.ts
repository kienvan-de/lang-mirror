import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

export const sentencesRouter = new Hono<{ Bindings: Env }>();

sentencesRouter.put("/:id", async (c) => {
  const body = await c.req.json();
  const { sentences } = buildContext(c.env);
  return c.json(await sentences.update(c.req.param("id"), body));
});

sentencesRouter.delete("/:id", async (c) => {
  const { sentences } = buildContext(c.env);
  await sentences.delete(c.req.param("id"));
  return c.json({ deleted: true });
});
