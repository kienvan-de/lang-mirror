import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  onClose: () => void;
}

export function ShortcutHelpOverlay({ onClose }: Props) {
  const { t } = useTranslation();

  const SHORTCUTS = [
    { key: "Space", action: t("shortcuts.space"), condition: t("shortcuts.spaceCondition") },
    { key: "R", action: t("shortcuts.r"), condition: t("shortcuts.rCondition") },
    { key: "P", action: t("shortcuts.p"), condition: t("shortcuts.pCondition") },
    { key: "→ / L", action: t("shortcuts.arrowRight"), condition: t("shortcuts.arrowRightCondition") },
    { key: "← / H", action: t("shortcuts.arrowLeft"), condition: t("shortcuts.arrowLeftCondition") },
    { key: "T", action: t("shortcuts.t"), condition: t("shortcuts.tCondition") },
    { key: "?", action: t("shortcuts.question"), condition: t("shortcuts.questionCondition") },
    { key: "Esc", action: t("shortcuts.esc"), condition: t("shortcuts.escCondition") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t("shortcuts.title")}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t("common.close")}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(({ key, action, condition }) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-xs text-gray-700 dark:text-gray-300">
                  {key}
                </kbd>
                <span className="text-gray-700 dark:text-gray-300">{action}</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{condition}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
