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
import { tagsRouter }     from "./tags";
import { pathsRouter }    from "./paths";
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
  // Use explicit origin allowlist — never wildcard with credentials:true
  app.use("*", cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGINS
        ? c.env.ALLOWED_ORIGINS.split(",").map((s: string) => s.trim())
        : [];
      if (!origin || allowed.includes(origin)) return origin ?? "";
      return "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }));

  // ── Security headers ─────────────────────────────────────────────────────────
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  // ── Health (public) ─────────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({ status: "ok", target: "cloudflare", ts: new Date().toISOString() })
  );

  // ── Resolve session cookie for all /api/* routes ────────────────────────────
  app.use("/api/*", authMiddleware);

  // ── Public routes — OIDC flow, no auth guard required ───────────────────────
  app.route("/api/auth", authRouter);

  // ── Reject anonymous before reaching any protected route handler ─────────────
  app.use("/api/*", authGuard);

  // ── Protected API routes ─────────────────────────────────────────────────────
  app.route("/api/topics",    topicsRouter);   // /api/topics + /api/topics/:id/versions
  app.route("/api/versions",  versionsRouter); // /api/versions/:id + sentences
  app.route("/api/sentences",  sentencesRouter);
  app.route("/api/tts",        ttsRouter);
  app.route("/api/recordings", recordingsRouter);
  app.route("/api/practice",   practiceRouter);
  app.route("/api/settings",   settingsRouter);
  app.route("/api/import",     importRouter);
  app.route("/api/export",     exportRouter);
  app.route("/api/users",      usersRouter);
  app.route("/api/tags",       tagsRouter);
  app.route("/api/path",       pathsRouter);

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
