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

/** Human-readable language name for a BCP-47 code */
export function langName(langCode: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(langCode) ?? langCode;
  } catch {
    return langCode;
  }
}
