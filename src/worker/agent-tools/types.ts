/**
 * Shared types for agent tool definitions.
 */
import type { AuthUser } from "../../core/auth/context";
import type { TopicsService } from "../../core/services/topics.service";
import type { PracticeService } from "../../core/services/practice.service";
import type { PathsService } from "../../core/services/paths.service";
import type { SettingsService } from "../../core/services/settings.service";
import type { ImportService } from "../../core/services/import.service";

/** Dependencies injected into each tool builder. */
export interface ToolDeps {
  user: AuthUser;
  topics: TopicsService;
  practice: PracticeService;
  paths: PathsService;
  settings: SettingsService;
  importer: ImportService;
}
