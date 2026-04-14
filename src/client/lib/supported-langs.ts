/**
 * Canonical list of supported UI + learning languages.
 *
 * This is the single source of truth used by:
 *   - i18n/index.ts        → supportedLngs (UI translations)
 *   - routes/settings.tsx  → native / learning language pickers
 *   - routes/onboarding.tsx → onboarding language pickers
 *
 * To add a new language:
 *   1. Add the BCP-47 code here
 *   2. Add a locale JSON file in src/client/i18n/locales/<code>.json
 *   3. Import and register it in src/client/i18n/index.ts
 */
export const SUPPORTED_LANGS = ["en", "vi", "ja", "de", "fr", "zh", "ko"] as const;

export type SupportedLang = (typeof SUPPORTED_LANGS)[number];
