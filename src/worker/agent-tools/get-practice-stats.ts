import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

export function getPracticeStats({ user, practice }: Pick<ToolDeps, "user" | "practice">) {
  return tool({
    description:
      "Get today's practice statistics: total attempts, unique sentences, topics practiced.",
    inputSchema: z.object({}),
    execute: async () => runWithAuth(user, () => practice.getDailyStats()),
  });
}
