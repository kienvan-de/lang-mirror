/** Return a flag emoji for a BCP-47 language code like "ja", "es", "fr-FR". */
export function langFlag(langCode: string): string {
  const base = langCode.split("-")[0]!.toLowerCase();
  const flagMap: Record<string, string> = {
    af: "🇿🇦", ar: "🇸🇦", bg: "🇧🇬", bn: "🇧🇩", ca: "🇪🇸",
    cs: "🇨🇿", cy: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", da: "🇩🇰", de: "🇩🇪", el: "🇬🇷",
    en: "🇬🇧", es: "🇪🇸", et: "🇪🇪", fa: "🇮🇷", fi: "🇫🇮",
    fil: "🇵🇭", fr: "🇫🇷", ga: "🇮🇪", gl: "🇪🇸", gu: "🇮🇳",
    he: "🇮🇱", hi: "🇮🇳", hr: "🇭🇷", hu: "🇭🇺", hy: "🇦🇲",
    id: "🇮🇩", is: "🇮🇸", it: "🇮🇹", ja: "🇯🇵", jv: "🇮🇩",
    ka: "🇬🇪", km: "🇰🇭", kn: "🇮🇳", ko: "🇰🇷", lo: "🇱🇦",
    lt: "🇱🇹", lv: "🇱🇻", mk: "🇲🇰", ml: "🇮🇳", mn: "🇲🇳",
    mr: "🇮🇳", ms: "🇲🇾", mt: "🇲🇹", my: "🇲🇲", nb: "🇳🇴",
    ne: "🇳🇵", nl: "🇳🇱", pl: "🇵🇱", ps: "🇦🇫", pt: "🇵🇹",
    ro: "🇷🇴", ru: "🇷🇺", si: "🇱🇰", sk: "🇸🇰", sl: "🇸🇮",
    so: "🇸🇴", sq: "🇦🇱", sr: "🇷🇸", su: "🇮🇩", sv: "🇸🇪",
    sw: "🇰🇪", ta: "🇮🇳", te: "🇮🇳", th: "🇹🇭", tr: "🇹🇷",
    uk: "🇺🇦", ur: "🇵🇰", uz: "🇺🇿", vi: "🇻🇳", zh: "🇨🇳",
    zu: "🇿🇦",
  };
  return flagMap[base] ?? "🌐";
}

/** Uppercase short label, e.g. "ja" → "JA", "fr-FR" → "FR" */
export function langLabel(langCode: string): string {
  return langCode.split("-")[0]!.toUpperCase();
}

/**
 * Human-readable language name for a BCP-47 code, displayed in its own language.
 * e.g. "vi" → "Tiếng Việt", "ja" → "日本語", "de" → "Deutsch"
 * Falls back to English display name, then the raw code.
 */
export function langName(langCode: string): string {
  const base = langCode.split("-")[0]!;
  try {
    // Display the language name in its own language (e.g. "vi" rendered in Vietnamese)
    return new Intl.DisplayNames([base], { type: "language" }).of(base) ?? langCode;
  } catch {
    try {
      // Fallback: display in English
      return new Intl.DisplayNames(["en"], { type: "language" }).of(base) ?? langCode;
    } catch {
      return langCode;
    }
  }
}
