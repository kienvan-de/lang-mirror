import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

export function getPracticeCalendar({ user, practice }: Pick<ToolDeps, "user" | "practice">) {
  return tool({
    description:
      "Get practice activity calendar showing attempts per day. Useful for showing progress over time.",
    inputSchema: z.object({
      weeks: z
        .number()
        .min(1)
        .max(52)
        .optional()
        .describe("Number of weeks to look back (default 12)"),
    }),
    execute: async ({ weeks }) =>
      runWithAuth(user, () => practice.getCalendar(weeks ?? 12)),
  });
}
