import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

const DESCRIPTION =
  "Get the user's settings including native language, practice mode, TTS preferences.";

const SCHEMA = z.object({});

export function getSettings({ user, settings }: Pick<ToolDeps, "user" | "settings">) {
  return tool({
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    execute: async () => runWithAuth(user, () => settings.getAll()),
  });
}
