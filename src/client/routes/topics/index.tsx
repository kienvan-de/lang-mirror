import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { api } from "../../lib/api";
import { TopicCard, TopicCardSkeleton } from "../../components/topic/TopicCard";
import { CreateTopicModal } from "../../components/topic/CreateTopicModal";
import { useAuth } from "../../hooks/useAuth";
import { useUserLanguages } from "../../hooks/useUserLanguages";

const PAGE_SIZE = 20;

export function TopicsPage() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const { hasConfig, requiredLanguages } = useUserLanguages();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["topics", page],
    queryFn: () => api.getTopics({ page, limit: PAGE_SIZE }),
  });

  const topics = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: api.getTags,
  });

  const isAdminUser = user?.role === "admin";

  // Only show tags that are associated with at least one visible topic
  const usedTags = useMemo(() => {
    const usedIds = new Set(topics.flatMap(t => t.tags?.map(tag => tag.id) ?? []));
    return (tags ?? []).filter(tag => usedIds.has(tag.id));
  }, [topics, tags]);

  const filteredTopics = topics.filter(t => {
    // Admins see everything the backend returned — no client-side filtering
    if (isAdminUser) {
      // Still apply tag filter if admin has selected tags
      if (selectedTagIds.length > 0) {
        return t.tags?.some(tag => selectedTagIds.includes(tag.id)) ?? false;
      }
      return true;
    }
    // Owned topics are always shown to regular users
    if (user && t.owner_id === user.id) return true;
    // Language config filter — only for non-owners
    if (hasConfig && requiredLanguages.length > 0) {
      const topicLangs = (t.versions ?? []).map(v => v.language_code.split("-")[0]!.toLowerCase());
      if (!requiredLanguages.every(lang => topicLangs.includes(lang))) return false;
    }
    // Tag filter
    if (selectedTagIds.length > 0) {
      return t.tags?.some(tag => selectedTagIds.includes(tag.id)) ?? false;
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("topics.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {data
              ? t("topics.subtitleCount", { count: total })
              : t("topics.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors shadow-sm"
        >
          <PlusIcon className="w-4 h-4" /> {t("topics.newTopic")}
        </button>
      </div>

      {/* Tag filter */}
      {usedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {usedTags.map(tag => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => setSelectedTagIds(prev =>
                  active ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                )}
                className="px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                style={active
                  ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                  : { backgroundColor: tag.color + "15", borderColor: tag.color, color: tag.color }
                }
              >{tag.name}</button>
            );
          })}
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >Clear</button>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <TopicCardSkeleton key={i} />)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{t("topics.loadError")}</p>
          <p className="text-sm text-red-500 dark:text-red-500 mt-1">{t("topics.loadErrorHint")}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && total === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center">
          <img src="/logo.png" alt="Lang Mirror" className="w-16 h-16 mx-auto mb-4 object-contain" />
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">{t("topics.empty")}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {t("topics.emptySubtitle")}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              {t("topics.createTopic")}
            </button>
            <Link
              to="/import"
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("topics.importLesson")}
            </Link>
          </div>
        </div>
      )}

      {/* Topic grid */}
      {!isLoading && !isError && topics.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTopics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            {t("common.previous", "Previous")}
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400 px-3">
            {t("common.pageOf", { page, totalPages })}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("common.next", "Next")}
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && <CreateTopicModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
