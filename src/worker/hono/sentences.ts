import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

export const sentencesRouter = new Hono<{ Bindings: Env }>();

sentencesRouter.put("/:id", validateUuidParam("id"), async (c) => {
  const body = await c.req.json<{ text?: string; notes?: Record<string, string> }>();
  const { sentences } = await buildContext(c.env);
  // Explicitly allowlist fields — never pass raw body to service
  return c.json(await sentences.update(c.req.param("id")!, {
    text:  typeof body.text  === "string" ? body.text  : undefined,
    notes: body.notes && typeof body.notes === "object" && !Array.isArray(body.notes)
      ? body.notes as Record<string, string>
      : undefined,
  }));
});

sentencesRouter.delete("/:id", validateUuidParam("id"), async (c) => {
  const { sentences } = await buildContext(c.env);
  await sentences.delete(c.req.param("id")!);
  return c.json({ deleted: true });
});
