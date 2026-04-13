/**
 * Global CORS middleware.
 *
 * Origins are controlled by the ALLOWED_ORIGINS environment variable
 * (comma-separated list, e.g. "https://app.example.com,https://staging.example.com").
 *
 * Security rules:
 *   - Never wildcard when credentials: true — an explicit allowlist is always required.
 *   - Requests from unlisted origins receive an empty Allow-Origin header,
 *     which causes the browser to block the response.
 *   - Requests with no Origin header (e.g. same-origin, curl) are passed through.
 */
import { cors } from "hono/cors";
import type { Env } from "../../types";

export const corsMiddleware = cors({
  origin: (origin, c) => {
    const env = (c.env as Env);
    const allowed = env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
      : [];
    // No Origin header → same-origin or non-browser request, allow through
    if (!origin) return "";
    return allowed.includes(origin) ? origin : "";
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  credentials: true,
});
