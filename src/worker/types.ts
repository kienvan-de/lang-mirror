/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
  TTS_CACHE: R2Bucket;
  RECORDINGS: R2Bucket;
  SESSION_CACHE: KVNamespace;
}
