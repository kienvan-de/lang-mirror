import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { api, type Voice } from "../../lib/api";
import { langFlag, langName } from "../../lib/lang";
import { SUPPORTED_LANGS } from "../../lib/supported-langs";

interface Props {
  topicId: string;
  onClose: () => void;
}

interface LangOption {
  langCode: string;
  locale: string;
  displayLabel: string;
  voices: Voice[];
}

export function AddLanguageModal({ topicId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedLang, setSelectedLang] = useState<LangOption | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [apiError, setApiError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: () => api.getVoices(),
    staleTime: 60_000,
  });

  const langOptions = useMemo<LangOption[]>(() => {
    const map = new Map<string, LangOption>();
    for (const v of voices) {
      // Only include voices whose langCode matches a supported language
      if (!SUPPORTED_LANGS.includes(v.langCode as typeof SUPPORTED_LANGS[number])) continue;
      if (!map.has(v.langCode)) {
        map.set(v.langCode, {
          langCode: v.langCode,
          locale: v.locale,
          displayLabel: `${langFlag(v.langCode)} ${langName(v.langCode)}`,
          voices: [],
        });
      }
      map.get(v.langCode)!.voices.push(v);
    }
    return Array.from(map.values()).sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [voices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? langOptions.filter((l) => l.displayLabel.toLowerCase().includes(q) || l.langCode.toLowerCase().includes(q))
      : langOptions;
  }, [langOptions, search]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createVersion(topicId, {
        language_code: selectedLang!.langCode,
        voice_name: selectedVoice || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
      onClose();
    },
    onError: (err: Error & { status?: number; data?: { error?: string } }) => {
      if (err.status === 409) {
        setApiError(t("addLanguage.alreadyExists"));
      } else {
        setApiError(err.data?.error ?? t("common.error"));
      }
    },
  });

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const selectLang = (opt: LangOption) => {
    setSelectedLang(opt);
    setSelectedVoice(opt.voices[0]?.name ?? "");
    setSearch("");
    setApiError("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t("addLanguage.title")}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t("common.close")}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {selectedLang ? (
          <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{selectedLang.displayLabel}</span>
            <button
              onClick={() => { setSelectedLang(null); setSelectedVoice(""); }}
              className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {t("common.change")}
            </button>
          </div>
        ) : (
          <>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("addLanguage.searchPlaceholder")}
              className="w-full px-3 py-2 mb-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="overflow-y-auto flex-1 min-h-0 max-h-56 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-400">{t("addLanguage.noLanguages")}</p>
              )}
              {filtered.map((opt) => (
                <button
                  key={opt.langCode}
                  onClick={() => selectLang(opt)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-800 dark:text-gray-200 transition-colors flex items-center justify-between"
                >
                  <span>{opt.displayLabel}</span>
                  <span className="text-xs text-gray-400">{t("addLanguage.voiceCount", { count: opt.voices.length })}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {selectedLang && selectedLang.voices.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("addLanguage.voiceLabel")}</label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedLang.voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.displayName} ({v.gender})
                </option>
              ))}
            </select>
          </div>
        )}

        {apiError && (
          <p className="mb-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {apiError}
          </p>
        )}

        <div className="flex gap-3 mt-auto pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!selectedLang || mutation.isPending}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-medium text-white transition-colors"
          >
            {mutation.isPending ? t("addLanguage.adding") : t("addLanguage.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
