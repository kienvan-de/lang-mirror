import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "../../lib/api";

interface Props {
  onClose: () => void;
}

export function CreateTopicModal({ onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const mutation = useMutation({
    mutationFn: () => api.createTopic({ title: title.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics"] });
      onClose();
    },
    onError: (err: Error & { data?: { field?: string; error?: string } }) => {
      if (err.data?.field === "title") setTitleError(err.data.error ?? t("createTopic.titleRequired"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTitleError("");
    if (!title.trim()) { setTitleError(t("createTopic.titleRequired")); return; }
    mutation.mutate();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t("createTopic.title")}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t("common.close")}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("createTopic.titleLabel")} <span className="text-red-500">{t("common.required")}</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleError(""); }}
              placeholder={t("createTopic.titlePlaceholder")}
              maxLength={200}
              className={`w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors ${
                titleError
                  ? "border-red-400 focus:ring-red-400"
                  : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              }`}
            />
            {titleError && <p className="mt-1 text-xs text-red-500">{titleError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("createTopic.descriptionLabel")} <span className="text-gray-400 text-xs font-normal">{t("common.optional")}</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("createTopic.descriptionPlaceholder")}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-sm font-medium text-white transition-colors"
            >
              {mutation.isPending ? t("createTopic.creating") : t("createTopic.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
