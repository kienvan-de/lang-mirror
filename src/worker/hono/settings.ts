import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import type { Env } from "../types";

export const settingsRouter = new Hono<{ Bindings: Env }>();

settingsRouter.get("/", async (c) => {
  const { settings } = await buildContext(c.env);
  return c.json(await settings.getAll());
});

settingsRouter.get("/data-path", adminGuard, (c) =>
  c.json({ path: "cloudflare:r2", note: "Data is stored in Cloudflare R2" })
);

settingsRouter.get("/:key{.+}", async (c) => {
  const { settings } = await buildContext(c.env);
  return c.json(await settings.get(decodeURIComponent(c.req.param("key"))));
});

settingsRouter.put("/:key{.+}", async (c) => {
  const { value } = await c.req.json<{ value?: string }>();
  if (value === undefined) return c.json({ error: "value is required" }, 400);
  const { settings } = await buildContext(c.env);
  return c.json(await settings.set(decodeURIComponent(c.req.param("key")), value));
});
