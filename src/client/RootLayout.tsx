import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import { useAuth } from "./hooks/useAuth";

const LANGS = [
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "vi", flag: "🇻🇳", label: "VI" },
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "ja", flag: "🇯🇵", label: "JA" },
] as const;

const PUBLIC_PATHS = new Set(["/login"]);

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const { user, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate  = useNavigate();

  // Route protection — redirect to /login if not authenticated
  useEffect(() => {
    if (!isLoading && !user && !PUBLIC_PATHS.has(location.pathname)) {
      navigate({ to: "/login" });
    }
  }, [isLoading, user, location.pathname, navigate]);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  if (dark) document.documentElement.classList.add("dark");

  // Show only the outlet for public pages (login)
  if (PUBLIC_PATHS.has(location.pathname)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Outlet />
      </div>
    );
  }

  // Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  // Not logged in — return empty while redirect happens
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 flex items-center gap-6 sticky top-0 z-40 shadow-sm">
        <Link to="/" className="font-bold text-lg tracking-tight select-none text-gray-900 dark:text-gray-100">
          🪞 Lang Mirror
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
            >
              <span>{flag}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
          aria-label={t("nav.toggleDark")}
        >
          {dark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
        </button>

        {/* User badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 select-none">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 max-w-[100px] truncate">
              {user.name}
            </span>
            {user.role === "admin" && (
              <span className="text-[10px] text-blue-500 font-medium">admin</span>
            )}
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1"
            title="Sign out"
          >
            ⎋
          </button>
        </div>
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
