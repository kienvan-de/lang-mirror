import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

export const practiceRouter = new Hono<{ Bindings: Env }>();

practiceRouter.post("/attempts", async (c) => {
  const body = await c.req.json<{
    sentence_id?: string;
    version_id?: string;
    topic_id?: string;
  }>();
  const { practice } = await buildContext(c.env);
  // Explicitly allowlist fields — never pass raw body to service
  return c.json(await practice.logAttempt({
    sentence_id: typeof body.sentence_id === "string" ? body.sentence_id : "",
    version_id:  typeof body.version_id  === "string" ? body.version_id  : "",
    topic_id:    typeof body.topic_id    === "string" ? body.topic_id    : "",
  }), 201);
});

// ── Consolidated dashboard endpoint (4-in-1) ─────────────────────────────────
// Replaces the four individual stats endpoints with a single Worker invocation.
// Saves ~4× Worker requests on every auto-refresh (free tier quota friendly).
practiceRouter.get("/stats/dashboard", async (c) => {
  const raw = parseInt(c.req.query("weeks") ?? "12", 10);
  const weeks = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 52)) : 12;
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getDashboard(weeks));
});

// ── Individual endpoints kept for backward-compat (agent tools, etc.) ────────
practiceRouter.get("/stats/daily", async (c) => {
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getDailyStats());
});

practiceRouter.get("/stats/streak", async (c) => {
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getStreak());
});

practiceRouter.get("/stats/recent", async (c) => {
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getRecent());
});

practiceRouter.get("/stats/calendar", async (c) => {
  const raw = parseInt(c.req.query("weeks") ?? "12", 10);
  const weeks = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 52)) : 12;
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getCalendar(weeks));
});
