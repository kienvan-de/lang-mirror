import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import vi from "./locales/vi.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
      de: { translation: de },
      ja: { translation: ja },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "vi", "de", "ja"],
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: "lang-mirror-lang",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false, // React handles XSS
    },
  });

export default i18n;
