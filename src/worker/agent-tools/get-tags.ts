import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "List all available tags. Tags must be selected from this list when " +
  "creating or updating topics — free-form tag names are not allowed.";

const SCHEMA = z.object({});

export function getTags({ user, tags }: Pick<ToolDeps, "user" | "tags">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async () => runWithAuth(user, () => tags.list()),
  });
}
