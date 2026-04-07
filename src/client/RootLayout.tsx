import { Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";

const LANGS = [
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "vi", flag: "🇻🇳", label: "VI" },
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "ja", flag: "🇯🇵", label: "JA" },
] as const;

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  if (dark) document.documentElement.classList.add("dark");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 flex items-center gap-6 sticky top-0 z-40 shadow-sm">
        <Link to="/" className="font-bold text-lg tracking-tight select-none text-gray-900 dark:text-gray-100">
          🪞 lang-mirror
        </Link>
        <div className="flex gap-1 flex-1">
          {(
            [
              { to: "/" as const, labelKey: "nav.dashboard" },
              { to: "/topics" as const, labelKey: "nav.topics" },
              { to: "/import" as const, labelKey: "nav.import" },
              { to: "/settings" as const, labelKey: "nav.settings" },
            ] as const
          ).map(({ to, labelKey }) => (
            <Link
              key={to}
              to={to}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors [&.active]:text-blue-600 dark:[&.active]:text-blue-400 [&.active]:bg-blue-50 dark:[&.active]:bg-blue-900/20"
            >
              {t(labelKey)}
            </Link>
          ))}
        </div>

        {/* Language switcher */}
        <div className="flex items-center gap-0.5">
          {LANGS.map(({ code, flag, label }) => (
            <button
              key={code}
              onClick={() => i18n.changeLanguage(code)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                i18n.language === code
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
              title={code.toUpperCase()}
            >
              <span>{flag}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={toggleDark}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
          aria-label={t("nav.toggleDark")}
        >
          {dark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
