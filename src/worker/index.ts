import { createApp } from "./hono/app";
import type { Env } from "./types";

export type { Env };

const app = createApp();

export default app satisfies ExportedHandler<Env>;
