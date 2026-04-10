/**
 * PKCE helpers — all use globalThis.crypto (Bun, CF Workers, browsers).
 */

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Generate a random code_verifier (43–128 chars, base64url) */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(48);
  globalThis.crypto.getRandomValues(bytes);
  return base64urlEncode(bytes.buffer);
}

/** Compute code_challenge = BASE64URL(SHA256(verifier)) */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64urlEncode(buf);
}

/** Generate a random state parameter */
export function generateState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Generate a random nonce */
export function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
