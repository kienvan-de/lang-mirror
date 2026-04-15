import { routeAuthenticatedAgent } from "./lib/routeAgent";
import { createApp } from "./hono/app";
import type { Env } from "./types";

// Re-export the agent class — required for Durable Object registration
export { ChatAgent } from "./agent";

export type { Env };

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Agent requests (WebSocket /agents/*) — auth + route to Durable Object
    const agentResponse = await routeAuthenticatedAgent(request, env);
    if (agentResponse) return agentResponse;

    // Everything else → Hono (API routes, static assets, etc.)
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
