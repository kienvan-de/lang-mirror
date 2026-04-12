import { Hono } from "hono";
import { buildContext } from "../lib/context";
import type { Env } from "../types";

export const practiceRouter = new Hono<{ Bindings: Env }>();

practiceRouter.post("/attempts", async (c) => {
  const body = await c.req.json();
  const { practice } = await buildContext(c.env);
  return c.json(await practice.logAttempt(body), 201);
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
  const weeks = parseInt(c.req.query("weeks") ?? "12", 10);
  const { practice } = await buildContext(c.env);
  return c.json(await practice.getCalendar(weeks));
});
