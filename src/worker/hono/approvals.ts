import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { adminGuard } from "./middleware/admin";
import { validateUuidParam } from "./middleware/validate";
import type { Env } from "../types";

export const approvalsRouter = new Hono<{ Bindings: Env }>();

// GET /api/approvals — list pending requests (admin only)
approvalsRouter.get("/", adminGuard, async (c) => {
  const { approvals } = await buildContext(c.env);
  return c.json(await approvals.listPending());
});

// PUT /api/approvals/:id/approve — admin approves
// Note: no validateUuidParam here — approval IDs are crypto.randomUUID() standard UUIDs
approvalsRouter.put("/:id/approve", adminGuard, async (c) => {
  const { approvals } = await buildContext(c.env);
  return c.json(await approvals.approve(c.req.param("id")!));
});

// PUT /api/approvals/:id/reject — admin rejects with note
approvalsRouter.put("/:id/reject", adminGuard, async (c) => {
  const body = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
  const { approvals } = await buildContext(c.env);
  return c.json(await approvals.reject(c.req.param("id")!, body.note ?? ""));
});

// GET /api/approvals/topic/:topicId — get latest request for a topic (owner or admin)
approvalsRouter.get("/topic/:topicId", validateUuidParam("topicId"), async (c) => {
  const { approvals } = await buildContext(c.env);
  const req = await approvals.getForTopic(c.req.param("topicId")!);
  if (!req) return c.json(null, 200);
  return c.json(req);
});
