import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRightIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { Topic } from "../../lib/api";
import { api } from "../../lib/api";
import { langFlag, langLabel } from "../../lib/lang";

interface Props {
  topic: Topic;
}

export function TopicCard({ topic }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTopic(topic.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topics"] }),
  });

  const versions = topic.versions ?? [];

  const bestProgress = versions.reduce((best, v) => Math.max(best, v.progressToday ?? 0), 0);
  const bestVersion = versions.find((v) => (v.progressToday ?? 0) === bestProgress && bestProgress > 0);

  return (
    <div className="group relative flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200">
      {/* Title */}
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1 leading-snug">
        {topic.title}
      </h3>

      {/* Description */}
      {topic.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
          {topic.description}
        </p>
      )}

      {/* Language badges */}
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[1.75rem]">
        {versions.length > 0 ? (
          versions.slice(0, 4).map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            >
              {langFlag(v.language_code)} {langLabel(v.language_code)}
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600 italic">{t("topicCard.noLanguages")}</span>
        )}
        {(topic.version_count ?? versions.length) > 4 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500">
            {t("topicCard.moreLanguages", { count: (topic.version_count ?? versions.length) - 4 })}
          </span>
        )}
      </div>

      {/* Today's progress bar */}
      {bestVersion && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {langFlag(bestVersion.language_code)} {t("topicCard.today")}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {bestVersion.practicedToday}/{bestVersion.totalSentences}
            </span>
          </div>
          <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                bestProgress === 100 ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${bestProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {t("topicCard.languageCount", { count: topic.version_count ?? versions.length })}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Delete button / confirm */}
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <span className="text-xs text-red-500 dark:text-red-400">{t("topicCard.deleteConfirm")}</span>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-xs px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-60"
              >
                {t("common.yes")}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {t("common.no")}
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-400 dark:text-gray-500 hover:border-red-300 dark:hover:border-red-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title={t("topicCard.deleteTopic")}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <Link
            to="/topics/$topicId"
            params={{ topicId: topic.id }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors"
          >
            {t("topicCard.open")} <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton placeholder ──────────────────────────────────────────────────────

export function TopicCardSkeleton() {
  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm animate-pulse">
      <div className="h-4 w-3/5 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded mb-1" />
      <div className="h-3 w-4/5 bg-gray-100 dark:bg-gray-800 rounded mb-4" />
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-full" />
        <div className="h-5 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-full" />
      </div>
      <div className="mt-auto flex justify-end">
        <div className="h-7 w-16 bg-blue-200 dark:bg-blue-900/40 rounded-lg" />
      </div>
    </div>
  );
}
