import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon, ArrowRightEndOnRectangleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { useAuth } from "./hooks/useAuth";
import { useUserLanguages } from "./hooks/useUserLanguages";
import { langFlag } from "./lib/lang";
import { ChatWidget } from "./components/ChatWidget";

const NAV_ITEMS = [
  { to: "/" as const,        labelKey: "nav.dashboard" },
  { to: "/path" as const,    labelKey: "nav.path"      },
  { to: "/topics" as const,  labelKey: "nav.topics"    },
  { to: "/import" as const,  labelKey: "nav.import"    },
  { to: "/settings" as const, labelKey: "nav.settings" },
] as const;

const PUBLIC_PATHS    = new Set(["/login", "/deactivated", "/privacy"]);
const FULL_PAGE_PATHS = new Set(["/onboarding"]); // auth required, but no sidebar

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isLoading, logout } = useAuth();
  const { nativeLanguage, hasConfig, isLoadingConfig } = useUserLanguages();
  const location = useLocation();
  const navigate  = useNavigate();

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Route protection — unauthenticated users go to /login
  useEffect(() => {
    if (!isLoading && !user && !PUBLIC_PATHS.has(location.pathname)) {
      navigate({ to: "/login" });
    }
  }, [isLoading, user, location.pathname, navigate]);

  // Onboarding redirect — new users who haven't set native language
  useEffect(() => {
    if (
      !isLoading && user &&               // authenticated
      !isLoadingConfig &&                 // settings loaded
      !hasConfig &&                       // native language not set
      !PUBLIC_PATHS.has(location.pathname) &&
      !FULL_PAGE_PATHS.has(location.pathname) // not already on onboarding
    ) {
      navigate({ to: "/onboarding" });
    }
  }, [isLoading, user, isLoadingConfig, hasConfig, location.pathname, navigate]);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  if (dark) document.documentElement.classList.add("dark");

  if (PUBLIC_PATHS.has(location.pathname)) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Outlet />
      </div>
    );
  }

  // Auth-required full-page routes (no sidebar) — onboarding, etc.
  if (FULL_PAGE_PATHS.has(location.pathname)) {
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
          <div className="w-8 h-8 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
        </div>
      );
    }
    if (!user) return null; // auth useEffect will redirect to /login
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Outlet />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <div className="w-8 h-8 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <nav className="border-b border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-40 shadow-sm">
        <div className="px-4 sm:px-6 py-3 flex items-center gap-3">

          {/* Logo */}
          <Link to="/" className="font-bold text-lg tracking-tight select-none text-gray-900 dark:text-gray-100 flex-shrink-0 flex items-center gap-2">
            <img src="/logo.png" alt="Lang Mirror" className="w-7 h-7 object-contain" />
            Lang Mirror Today
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-1 flex-1">
            {NAV_ITEMS.map(({ to, labelKey }) => (
              <Link
                key={to}
                to={to}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors [&.active]:text-blue-600 dark:[&.active]:text-blue-400 [&.active]:bg-blue-50 dark:[&.active]:bg-blue-900/20"
              >
                {t(labelKey)}
              </Link>
            ))}
            {/* Admin link — only visible to admin role */}
            {user?.role === "admin" && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors [&.active]:bg-purple-50 dark:[&.active]:bg-purple-900/20 flex items-center gap-1"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                {t("nav.admin")}
              </Link>
            )}
          </div>

          {/* Spacer on mobile */}
          <div className="flex-1 md:hidden" />

          {/* Native language indicator (links to settings) */}
          {nativeLanguage && (
            <Link to="/settings" className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={t("nav.languageSettings")}>
              <span>{langFlag(nativeLanguage)}</span>
            </Link>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 flex-shrink-0"
            aria-label={t("nav.toggleDark")}
          >
            {dark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
          </button>

          {/* User badge — desktop */}
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 select-none">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 max-w-[100px] truncate">{user.name}</span>
              {user.role === "admin" && <span className="text-[10px] text-blue-500 font-medium">admin</span>}
            </div>
            <button
              onClick={logout}
              className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <ArrowRightEndOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="md:hidden p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
            aria-label="Menu"
          >
            {menuOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-1">
            {/* Nav links */}
            {NAV_ITEMS.map(({ to, labelKey }) => (
              <Link
                key={to}
                to={to}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors [&.active]:text-blue-600 dark:[&.active]:text-blue-400 [&.active]:bg-blue-50 dark:[&.active]:bg-blue-900/20"
              >
                {t(labelKey)}
              </Link>
            ))}
            {/* Admin link — mobile, admin only */}
            {user?.role === "admin" && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors [&.active]:bg-purple-50 dark:[&.active]:bg-purple-900/20"
              >
                <ShieldCheckIcon className="w-4 h-4" />
                {t("nav.admin")}
              </Link>
            )}

            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-2 flex items-center justify-between gap-3">
              {/* Native language indicator */}
              {nativeLanguage && (
                <Link to="/settings" onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <span>{langFlag(nativeLanguage)}</span>
                </Link>
              )}

              {/* User + logout */}
              <div className="flex items-center gap-2">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 select-none">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{user.name}</span>
                <button
                  onClick={logout}
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Sign out"
                >
                  <ArrowRightEndOnRectangleIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main>
        <Outlet />
      </main>

      <ChatWidget />
    </div>
  );
}
