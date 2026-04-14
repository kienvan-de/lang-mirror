import { Hono } from "hono";
import { buildContext } from "../lib/context";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import type { Env } from "../types";

export const practiceRouter = new Hono<{ Bindings: Env }>();

// Rate limit practice attempts: 120 req / 60 s per user
const practiceAttemptRateLimit = rateLimitMiddleware({
  limit:      120,
  windowSecs: 60,
  keyPrefix:  "practice-attempt",
});

practiceRouter.post("/attempts", practiceAttemptRateLimit, async (c) => {
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
  // Cap weeks to 1–52 to prevent expensive full-table scans
  const weeks = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 52)) : 12;
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getCalendar(weeks));
});
