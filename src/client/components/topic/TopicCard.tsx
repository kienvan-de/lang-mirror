import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import type { Topic } from "../../lib/api";
import { langFlag, langLabel } from "../../lib/lang";

interface Props {
  topic: Topic;
}

export function TopicCard({ topic }: Props) {
  const versions = topic.versions ?? [];

  // US-7.5: best progress today across all versions
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
          <span className="text-xs text-gray-400 dark:text-gray-600 italic">No languages yet</span>
        )}
        {(topic.version_count ?? versions.length) > 4 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500">
            +{(topic.version_count ?? versions.length) - 4} more
          </span>
        )}
      </div>

      {/* US-7.5 — today's progress bar */}
      {bestVersion && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {langFlag(bestVersion.language_code)} Today
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
          {topic.version_count ?? versions.length} language{(topic.version_count ?? versions.length) !== 1 ? "s" : ""}
        </span>
        <Link
          to="/topics/$topicId"
          params={{ topicId: topic.id }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors"
        >
          Open <ArrowRightIcon className="w-3.5 h-3.5" />
        </Link>
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
