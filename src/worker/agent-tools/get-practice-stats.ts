import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get today's practice statistics: total attempts, unique sentences, topics practiced.";

const SCHEMA = z.object({});

export function getPracticeStats({ user, practice }: Pick<ToolDeps, "user" | "practice">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async () => runWithAuth(user, () => practice.getDailyStats()),
  });
}
