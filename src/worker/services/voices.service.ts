/**
 * Voices service for CF Workers.
 * Serves the bundled fallback list — no network refresh needed since
 * CF Workers are stateless and the bundle is always up to date at deploy time.
 */
import voicesFallback from "../../server/data/voices-fallback.json";

export interface Voice {
  name: string;        // "ja-JP-NanamiNeural"
  shortName: string;   // "NanamiNeural"
  locale: string;      // "ja-JP"
  langCode: string;    // "ja"
  gender: string;      // "Female"
  displayName: string;
}

const ALL_VOICES = voicesFallback as Voice[];

export function getVoices(langCode?: string): Voice[] {
  if (!langCode) return ALL_VOICES;
  const lower = langCode.toLowerCase();
  return ALL_VOICES.filter(
    v => v.langCode.toLowerCase() === lower ||
         v.locale.toLowerCase().startsWith(lower)
  );
}
