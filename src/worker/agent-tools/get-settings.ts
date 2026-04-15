import { tool } from "ai";
import { z } from "zod/v4";
import { runWithAuth } from "../../core/auth/context";
import type { ToolDeps } from "./types";

export function getSettings({ user, settings }: Pick<ToolDeps, "user" | "settings">) {
  return tool({
    description:
      "Get the user's settings including native language, practice mode, TTS preferences.",
    inputSchema: z.object({}),
    execute: async () => runWithAuth(user, () => settings.getAll()),
  });
}
