/**
 * Build per-request service instances from CF Worker env bindings.
 */
import { D1Adapter }      from "../adapters/db.adapter";
import { R2Adapter }      from "../adapters/storage.adapter";
import { EdgeTTSAdapter } from "../adapters/tts.adapter";
import { KVCacheAdapter } from "../adapters/cache.adapter";
import { TopicsService }     from "../../core/services/topics.service";
import { VersionsService }   from "../../core/services/versions.service";
import { SentencesService }  from "../../core/services/sentences.service";
import { TTSService }        from "../../core/services/tts.service";
import { RecordingsService } from "../../core/services/recordings.service";
import { PracticeService }   from "../../core/services/practice.service";
import { SettingsService }   from "../../core/services/settings.service";
import { ImportService }     from "../../core/services/import.service";
import { ExportService }     from "../../core/services/export.service";
import { OidcService }       from "../../core/services/oidc.service";
import { UsersService }      from "../../core/services/users.service";
import { TagsService }       from "../../core/services/tags.service";
import { PathsService }      from "../../core/services/paths.service";
import { ApprovalsService }  from "../../core/services/approvals.service";
import type { IExecutionContext } from "../../core/ports/execution.port";
import type { Env } from "../types";

export async function buildContext(env: Env, ctx?: IExecutionContext) {
  const db       = new D1Adapter(env.DB);
  const ttsCache = new R2Adapter(env.TTS_CACHE);
  const recs     = new R2Adapter(env.RECORDINGS);
  const cache    = new KVCacheAdapter(env.SESSION_CACHE);
  const settings = new SettingsService(db);

  // Resolve volatile Edge TTS protocol constants from DB settings.
  // Falls back to hardcoded defaults if keys are missing.
  const edgeTTSConfig = await settings.getEdgeTTSConfig();
  const tts           = new EdgeTTSAdapter(edgeTTSConfig);

  return {
    topics:     new TopicsService(db),
    versions:   new VersionsService(db, recs),
    sentences:  new SentencesService(db),
    ttsService: new TTSService(db, ttsCache, tts, ctx),
    recordings: new RecordingsService(db, recs),
    practice:   new PracticeService(db),
    settings,
    importer:   new ImportService(db),
    exporter:   new ExportService(db),
    oidc:       new OidcService(
      db, cache,
      env.SKIP_OIDC_URL_VALIDATION === "true",
      parseInt(env.MAX_USERS ?? "20", 10),
    ),
    users:      new UsersService(db),
    tags:       new TagsService(db),
    paths:      new PathsService(db),
    approvals:  new ApprovalsService(db),
  };
}
