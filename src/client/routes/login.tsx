import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRightEndOnRectangleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

interface OidcProvider {
  id: string;
  provider: string;
  display_name: string;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [providers, setProviders] = useState<OidcProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already logged in, redirect home
  useEffect(() => {
    if (!authLoading && isLoggedIn) {
      navigate({ to: "/" });
    }
  }, [isLoggedIn, authLoading, navigate]);

  // Check for error in query params (from OIDC callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setErrorMsg(decodeURIComponent(err));
  }, []);

  // Fetch providers
  useEffect(() => {
    api.getProviders()
      .then(setProviders)
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }, []);

  const handleLogin = (providerId: string) => {
    setLoggingIn(providerId);
    setErrorMsg(null);
    // Navigate directly — server responds with 302 to OIDC provider
    window.location.href = `/api/auth/login/${providerId}`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🪞</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">lang-mirror</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to continue
          </p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}

        {/* Provider buttons */}
        <div className="space-y-3">
          {loadingProviders ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-blue-400/40 border-t-blue-500 animate-spin" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              <p>No login providers configured.</p>
              <p className="mt-1 text-xs">Contact your administrator.</p>
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
                {loggingIn === p.id ? "Redirecting..." : `Continue with ${p.display_name}`}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
