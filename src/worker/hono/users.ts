import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import { deleteCookie } from "hono/cookie";
import type { Env } from "../types";

export const usersRouter = new Hono<{ Bindings: Env }>();

// GET /api/users/me
usersRouter.get("/me", async (c) => {
  const { users } = await buildContext(c.env);
  return c.json(await users.getMe());
});

// DELETE /api/users/me — self-service account deletion
// Must be before /:id to avoid route conflict
usersRouter.delete("/me", async (c) => {
  const { users, recordings, oidc } = await buildContext(c.env);

  // 1. Delete all user's recordings from R2
  await recordings.deleteMyRecordings();

  // 2. Delete the user row (cascades to topics, sentences, settings, paths, etc.)
  await users.deleteMe();

  // 3. Invalidate session cookie
  const isSecure = c.req.url.startsWith("https://");
  const cookieName = isSecure ? "__Host-session" : "session";
  deleteCookie(c, cookieName, {
    path: "/",
    secure: isSecure,
    httpOnly: true,
    sameSite: "Lax",
  });

  return c.json({ deleted: true });
});

// GET /api/users — admin only
usersRouter.get("/", adminGuard, async (c) => {
  const { users } = await buildContext(c.env);
  return c.json(await users.listUsers());
});

// GET /api/users/:id — admin only
usersRouter.get("/:id", adminGuard, async (c) => {
  const { users } = await buildContext(c.env);
  return c.json(await users.getUserById(c.req.param("id")));
});

// PUT /api/users/:id/role — admin only
usersRouter.put("/:id/role", adminGuard, async (c) => {
  const { role } = await c.req.json<{ role: "user" | "admin" }>();
  const { users } = await buildContext(c.env);
  return c.json(await users.updateRole(c.req.param("id"), role));
});

// PUT /api/users/:id/deactivate — admin only
usersRouter.put("/:id/deactivate", adminGuard, async (c) => {
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const { users } = await buildContext(c.env);
  return c.json(await users.deactivateUser(c.req.param("id"), reason ?? ""));
});

// PUT /api/users/:id/activate — admin only
usersRouter.put("/:id/activate", adminGuard, async (c) => {
  const { users } = await buildContext(c.env);
  return c.json(await users.activateUser(c.req.param("id")));
});

// DELETE /api/users/:id — admin only
usersRouter.delete("/:id", adminGuard, async (c) => {
  const { users } = await buildContext(c.env);
  await users.deleteUser(c.req.param("id"));
  return c.json({ deleted: true });
});
