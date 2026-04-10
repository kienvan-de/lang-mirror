import { Hono } from "hono";
import { cors } from "hono/cors";
import { topicsRouter }    from "./topics";
import { versionsRouter }  from "./versions";
import { sentencesRouter } from "./sentences";
import { ttsRouter }       from "./tts";
import { recordingsRouter } from "./recordings";
import { practiceRouter }  from "./practice";
import { settingsRouter }  from "./settings";
import { importRouter }    from "./import";
import { exportRouter }    from "./export";
import { authRouter }      from "./auth";
import { usersRouter }     from "./users";
import { authMiddleware } from "./middleware/auth";
import { authGuard }      from "./middleware/guard";
import {
  NotFoundError, ConflictError, ValidationError,
  UnauthorizedError, ForbiddenError,
} from "../../core/errors";
import type { Env } from "../types";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  // ── Global CORS ─────────────────────────────────────────────────────────────
  app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }));

  // ── Health (public) ─────────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({ status: "ok", target: "cloudflare", ts: new Date().toISOString() })
  );

  // ── Public routes — OIDC flow, no session required ──────────────────────────
  app.route("/api/auth", authRouter);

  // ── Protected routes — session required ─────────────────────────────────────
  // 1. Resolve session cookie → set auth context
  app.use("/api/*", authMiddleware);
  // 2. Reject anonymous before reaching any route handler
  app.use("/api/*", authGuard);

  // ── Protected API routes ─────────────────────────────────────────────────────
  app.route("/api/topics",     topicsRouter);
  app.route("/api",            versionsRouter);
  app.route("/api/sentences",  sentencesRouter);
  app.route("/api/tts",        ttsRouter);
  app.route("/api/recordings", recordingsRouter);
  app.route("/api/practice",   practiceRouter);
  app.route("/api/settings",   settingsRouter);
  app.route("/api/import",     importRouter);
  app.route("/api/export",     exportRouter);
  app.route("/api/users",      usersRouter);

  // ── Error handler ────────────────────────────────────────────────────────────
  app.notFound((c) => c.json({ error: "not found" }, 404));

  app.onError((err, c) => {
    console.error(`[worker] ${err.name}: ${err.message}`);
    if (err instanceof UnauthorizedError) return c.json({ error: err.message }, 401);
    if (err instanceof ForbiddenError)    return c.json({ error: err.message }, 403);
    if (err instanceof NotFoundError)     return c.json({ error: err.message }, 404);
    if (err instanceof ConflictError)     return c.json({ error: err.message }, 409);
    if (err instanceof ValidationError)   return c.json({ error: err.message, field: err.field }, 400);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}
