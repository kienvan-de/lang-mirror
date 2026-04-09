/**
 * Cloudflare Pages Functions catch-all for /api/* routes.
 * Delegates to the Hono app.
 */
import { createApp } from "../../src/worker/hono/app";
import type { Env } from "../../src/worker/types";

const app = createApp();

export const onRequest: PagesFunction<Env> = (ctx) => app.fetch(ctx.request, ctx.env);
