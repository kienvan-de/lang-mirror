import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

export function getStreak({ user, practice }: Pick<ToolDeps, "user" | "practice">) {
  return tool({
    description:
      "Get the user's current practice streak (consecutive days) and longest streak.",
    inputSchema: z.object({}),
    execute: async () => runWithAuth(user, () => practice.getStreak()),
  });
}
