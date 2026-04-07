import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { langFlag, langLabel } from "../../lib/lang";

interface Props {
  notes: Record<string, string>;
  uiLang: string;
  sentenceText: string;
  onClose: () => void;
}

export function NotesDialog({ notes, uiLang, sentenceText, onClose }: Props) {
  const { t } = useTranslation();

  // Pick notes for UI language, fall back to first available
  const notesText = notes[uiLang] ?? Object.values(notes)[0] ?? null;
  const fallbackLang = !notes[uiLang] && notesText ? Object.keys(notes)[0] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-auto flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-500 dark:text-amber-400 mb-1">
              {t("sentenceRow.notesDialogLabel")}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug line-clamp-2">
              {sentenceText}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t("common.close")}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Markdown body */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {fallbackLang && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-3">
              {langFlag(fallbackLang)} <span className="uppercase font-medium">{langLabel(fallbackLang)}</span>
            </p>
          )}
          {notesText ? (
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-gray-900 dark:prose-headings:text-gray-100
              prose-headings:font-semibold prose-h2:text-sm prose-h2:uppercase
              prose-h2:tracking-wide prose-h2:text-amber-600 dark:prose-h2:text-amber-400
              prose-h2:mt-4 prose-h2:mb-2 prose-h2:first:mt-0
              prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed
              prose-li:text-gray-700 dark:prose-li:text-gray-300
              prose-strong:text-gray-900 dark:prose-strong:text-gray-100
              prose-ul:my-1 prose-li:my-0.5
            ">
              <ReactMarkdown>{notesText}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t("sentenceRow.noNotes")}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
