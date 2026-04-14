import { useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { api } from "../lib/api";

export function DeactivatedPage() {
  const { t } = useTranslation();
  // reason is passed as a query param from the OIDC callback redirect
  const { reason } = useSearch({ strict: false }) as { reason?: string };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-xl p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <ShieldExclamationIcon className="w-8 h-8 text-red-500 dark:text-red-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t("deactivated.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("deactivated.subtitle")}
          </p>
        </div>

        {reason && reason.trim() && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-left">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
              {t("deactivated.reasonLabel")}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {decodeURIComponent(reason)}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t("deactivated.contactHint")}
        </p>

        <button
          onClick={() => api.logout().finally(() => window.location.replace("/login"))}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {t("deactivated.backToLogin")}
        </button>
      </div>
    </div>
  );
}
