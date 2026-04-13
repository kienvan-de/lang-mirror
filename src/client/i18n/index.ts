import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import vi from "./locales/vi.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import fr from "./locales/fr.json";
import zh from "./locales/zh.json";
import ko from "./locales/ko.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
      de: { translation: de },
      ja: { translation: ja },
      fr: { translation: fr },
      zh: { translation: zh },
      ko: { translation: ko },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "vi", "de", "ja", "fr", "zh", "ko"],
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
