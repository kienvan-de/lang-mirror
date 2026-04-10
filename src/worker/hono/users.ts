import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

export const usersRouter = new Hono<{ Bindings: Env }>();

// GET /api/users/me
usersRouter.get("/me", async (c) => {
  const { users } = buildContext(c.env);
  return c.json(await users.getMe());
});

// GET /api/users — admin only
usersRouter.get("/", async (c) => {
  const { users } = buildContext(c.env);
  return c.json(await users.listUsers());
});

// GET /api/users/:id — admin only
usersRouter.get("/:id", async (c) => {
  const { users } = buildContext(c.env);
  return c.json(await users.getUserById(c.req.param("id")));
});

// PUT /api/users/:id/role — admin only
usersRouter.put("/:id/role", async (c) => {
  const { role } = await c.req.json<{ role: "user" | "admin" }>();
  const { users } = buildContext(c.env);
  return c.json(await users.updateRole(c.req.param("id"), role));
});

// DELETE /api/users/:id — admin only
usersRouter.delete("/:id", async (c) => {
  const { users } = buildContext(c.env);
  await users.deleteUser(c.req.param("id"));
  return c.json({ deleted: true });
});
