/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
  TTS_CACHE: R2Bucket;
  RECORDINGS: R2Bucket;
  SESSION_CACHE: KVNamespace;
  /** Bound automatically by the assets: { directory: "./dist" } config in wrangler.jsonc */
  ASSETS: Fetcher;
  ALLOWED_ORIGINS?: string;
  /** Set to "true" in wrangler.toml [vars] for local dev only.
   *  Disables HTTPS + private-IP validation on OIDC provider URLs.
   *  Must never be set in production. */
  SKIP_OIDC_URL_VALIDATION?: string;
  /** Base URL of the UI in local dev (e.g. "http://localhost:5173").
   *  Used to redirect the browser back to the Vite dev server after OIDC callback.
   *  Leave unset in production — relative URLs are used instead. */
  APP_BASE_URL?: string;
}
