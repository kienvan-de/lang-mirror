import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRightEndOnRectangleIcon, ExclamationCircleIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { langFlag, langName } from "../lib/lang";
import { SUPPORTED_LANGS } from "../lib/supported-langs";

const LANG_MIRROR_LANG_KEY = "lang-mirror-lang";

interface OidcProvider {
  id: string;
  provider: string;
  display_name: string;
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [providers, setProviders] = useState<OidcProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  // If already logged in, redirect home
  useEffect(() => {
    if (!authLoading && isLoggedIn) {
      navigate({ to: "/" });
    }
  }, [isLoggedIn, authLoading, navigate]);

  // Check for error in query params (from OIDC callback).
  // Map to predefined messages to prevent reflected content injection via crafted URLs.
  useEffect(() => {
    const ERROR_MESSAGES: Record<string, string> = {
      missing_params:    t("login.errorMissingParams", "Login failed — missing parameters"),
      login_failed:      t("login.errorLoginFailed", "Login failed — please try again"),
      access_denied:     t("login.errorAccessDenied", "Access denied by the identity provider"),
      invalid_request:   t("login.errorInvalidRequest", "Invalid login request"),
      server_error:      t("login.errorServerError", "Server error — please try again later"),
      temporarily_unavailable: t("login.errorUnavailable", "Service temporarily unavailable"),
      registration_closed: t("login.errorRegistrationClosed", "Registration is currently closed. Please contact support@langmirror.today for access."),
    };
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      const code = decodeURIComponent(err).toLowerCase().replace(/\s+/g, "_");
      setErrorMsg(ERROR_MESSAGES[code] ?? t("login.errorGeneric", "Login failed — please try again"));
    }
  }, [t]);

  // Fetch providers and registration status in parallel
  useEffect(() => {
    Promise.all([
      api.getProviders().catch(() => [] as OidcProvider[]),
      api.getRegistrationStatus().catch(() => ({ open: true, current: 0, max: 20 })),
    ]).then(([prov, regStatus]) => {
      setProviders(prov);
      setRegistrationOpen(regStatus.open);
    }).finally(() => setLoadingProviders(false));
  }, []);

  const handleLogin = (providerId: string) => {
    setLoggingIn(providerId);
    setErrorMsg(null);
    // Navigate directly — server responds with 302 to OIDC provider
    window.location.href = `/api/auth/login/${providerId}`;
  };

  const switchLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem(LANG_MIRROR_LANG_KEY, code);
    setLangOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!langOpen) return;
    const handler = () => setLangOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [langOpen]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <div className="w-8 h-8 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  const currentLang = i18n.language.split("-")[0] ?? "en";

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-950 px-4">
      {/* Language switcher — top right */}
      <div className="flex justify-end pt-4 pr-1">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setLangOpen((v) => !v); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
              bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700
              text-gray-700 dark:text-gray-300
              hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
            aria-label="Change language"
          >
            <GlobeAltIcon className="w-4 h-4 text-gray-400" />
            <span>{langFlag(currentLang)}</span>
            <span>{langName(currentLang)}</span>
          </button>

          {langOpen && (
            <div
              className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-900
                border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg
                py-1 z-50 max-h-64 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {SUPPORTED_LANGS.map((code) => (
                <button
                  key={code}
                  onClick={() => switchLang(code)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2
                    hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${code === currentLang
                      ? "text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-900/10"
                      : "text-gray-700 dark:text-gray-300"
                    }`}
                >
                  <span>{langFlag(code)}</span>
                  <span>{langName(code)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Lang Mirror" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Lang Mirror Today</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("login.title", "Sign in to continue")}
          </p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}

        {/* Provider buttons or registration-closed notice */}
        <div className="space-y-3">
          {loadingProviders ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
            </div>
          ) : !registrationOpen ? (
            <div className="text-center py-8 px-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
                <ExclamationCircleIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("login.registrationClosed", "Registration is currently closed.")}
              </p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t("login.registrationClosedHint", "Please contact us for access:")}
              </p>
              <a
                href="mailto:support@langmirror.today"
                className="mt-2 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@langmirror.today
              </a>
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              <p>{t("login.noProviders", "No login providers configured.")}</p>
              <p className="mt-1 text-xs">{t("login.contactAdmin", "Contact your administrator.")}</p>
            </div>
          ) : (
            providers.map(p => (
              <button
                key={p.id}
                onClick={() => handleLogin(p.id)}
                disabled={!!loggingIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {loggingIn === p.id ? (
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin flex-shrink-0" />
                ) : (
                  <ArrowRightEndOnRectangleIcon className="w-4 h-4 flex-shrink-0 text-gray-400" />
                )}
                {loggingIn === p.id
                  ? t("login.redirecting", "Redirecting…")
                  : t("login.continueWith", { provider: p.display_name, defaultValue: `Continue with ${p.display_name}` })}
              </button>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
