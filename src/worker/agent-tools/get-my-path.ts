import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get the user's learning path with ordered topics and their completion status.";

const SCHEMA = z.object({});

export function getMyPath({ user, paths }: Pick<ToolDeps, "user" | "paths">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async () => runWithAuth(user, () => paths.getOrCreate()),
  });
}
