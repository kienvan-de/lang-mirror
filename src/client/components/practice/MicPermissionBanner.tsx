import { useTranslation } from "react-i18next";

interface Props {
  permissionState: "unknown" | "granted" | "denied" | "unavailable";
}

function isChrome() { return navigator.userAgent.includes("Chrome") && !navigator.userAgent.includes("Edg"); }
function isFirefox() { return navigator.userAgent.includes("Firefox"); }
function isSafari() { return navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome"); }

export function MicPermissionBanner({ permissionState }: Props) {
  const { t } = useTranslation();

  if (permissionState === "denied") {
    const instructions = isChrome()
      ? t("mic.chrome")
      : isFirefox()
        ? t("mic.firefox")
        : isSafari()
          ? t("mic.safari")
          : t("mic.other");

    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm">
        <span className="text-lg">⚠️</span>
        <div>
          <p className="font-semibold text-red-700 dark:text-red-400">{t("mic.deniedTitle")}</p>
          <p className="text-red-600 dark:text-red-500 mt-0.5">{instructions}</p>
        </div>
      </div>
    );
  }

  if (permissionState === "unavailable") {
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
        <span className="text-lg">🎙️</span>
        <div>
          <p className="font-semibold text-amber-700 dark:text-amber-400">{t("mic.unavailableTitle")}</p>
          <p className="text-amber-600 dark:text-amber-500 mt-0.5">{t("mic.unavailableSubtitle")}</p>
        </div>
      </div>
    );
  }

  return null;
}
