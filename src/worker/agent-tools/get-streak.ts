import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get the user's current practice streak (consecutive days) and longest streak.";

const SCHEMA = z.object({});

export function getStreak({ user, practice }: Pick<ToolDeps, "user" | "practice">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async () => runWithAuth(user, () => practice.getStreak()),
  });
}
