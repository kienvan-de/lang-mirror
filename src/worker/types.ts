/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
  TTS_CACHE: R2Bucket;
  RECORDINGS: R2Bucket;
  SESSION_CACHE: KVNamespace;
  ALLOWED_ORIGINS?: string;
  /** Set to "true" in wrangler.toml [vars] for local dev only.
   *  Disables HTTPS + private-IP validation on OIDC provider URLs.
   *  Must never be set in production. */
  SKIP_OIDC_URL_VALIDATION?: string;
}
