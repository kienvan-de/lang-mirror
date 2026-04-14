import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  AcademicCapIcon, PlusIcon, TrashIcon,
  ChevronUpIcon, ChevronDownIcon,
  MagnifyingGlassIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { api, type PathTopic, type Topic } from "../lib/api";
import { useUserLanguages } from "../hooks/useUserLanguages";

/** Resolve the best display title for a topic given the user's native language.
 *  Priority: native-lang version title → native-lang version topic title →
 *            first version title → raw topic title */
function resolveTopicTitle(topic: Topic, nativeLanguage: string | null): string {
  if (nativeLanguage && topic.versions) {
    const match = topic.versions.find(
      v => v.language_code.split("-")[0]!.toLowerCase() === nativeLanguage
    );
    if (match?.title) return match.title;
  }
  // Fallback: first version title, then raw topic title
  const firstTitle = topic.versions?.find(v => v.title)?.title;
  return firstTitle ?? topic.title;
}

export function PathPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { nativeLanguage } = useUserLanguages();

  const { data: path, isLoading } = useQuery({
    queryKey: ["path"],
    queryFn: api.getPath,
  });

  const { data: allTopics } = useQuery({
    queryKey: ["topics"],
    queryFn: api.getTopics,
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [topicSearch, setTopicSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["path"] });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) => api.updatePath(path!.id, data),
    onSuccess: () => { setEditingName(false); invalidate(); },
  });

  const addTopicMutation = useMutation({
    mutationFn: (topicId: string) => api.addTopicToPath(path!.id, topicId),
    onSuccess: () => { setShowAddTopic(false); setTopicSearch(""); invalidate(); },
  });

  const removeTopicMutation = useMutation({
    mutationFn: (topicId: string) => api.removeTopicFromPath(path!.id, topicId),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (topicIds: string[]) => api.reorderPathTopics(path!.id, topicIds),
    onSuccess: invalidate,
  });

  const copyMutation = useMutation({
    mutationFn: (sourcePathId: string) => api.copyPath(sourcePathId),
    onSuccess: () => { setShowSearch(false); setSearchQuery(""); invalidate(); },
  });

  const { data: searchResults } = useQuery({
    queryKey: ["path", "search", searchQuery],
    queryFn: () => api.searchPaths(searchQuery),
    enabled: searchQuery.trim().length > 1,
    staleTime: 10_000,
  });

  const moveUp = (index: number) => {
    if (!path || index === 0) return;
    const ids = path.topics.map(t => t.topic_id);
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    reorderMutation.mutate(ids);
  };

  const moveDown = (index: number) => {
    if (!path || index === path.topics.length - 1) return;
    const ids = path.topics.map(t => t.topic_id);
    [ids[index + 1], ids[index]] = [ids[index]!, ids[index + 1]!];
    reorderMutation.mutate(ids);
  };

  // Topics not yet in path
  const pathTopicIds = new Set((path?.topics ?? []).map(t => t.topic_id));
  const availableTopics = (allTopics ?? []).filter(topic =>
    !pathTopicIds.has(topic.id) &&
    resolveTopicTitle(topic, nativeLanguage).toLowerCase().includes(topicSearch.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800" />
        ))}
      </div>
    );
  }

  if (!path) return null;

  const doneCount = path.topics.filter(t => t.isDone).length;
  const totalCount = path.topics.length;
  const overallPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AcademicCapIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={() => updateMutation.mutate({ name: nameDraft })}
                onKeyDown={e => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="text-2xl font-bold bg-transparent border-b-2 border-blue-500 text-gray-900 dark:text-gray-100 focus:outline-none w-full"
              />
            ) : (
              <h1
                className="text-2xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors group inline-flex items-center gap-2"
                onClick={() => { setNameDraft(path.name); setEditingName(true); }}
              >
                {path.name}
                <PencilIcon className="w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity" />
              </h1>
            )}
          </div>
          {totalCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("path.progress", { done: doneCount, total: totalCount, pct: overallPct })}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowSearch(v => !v)}
          className="flex-shrink-0 self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <MagnifyingGlassIcon className="w-4 h-4" /> {t("path.findPaths")}
        </button>
      </div>

      {/* Overall progress bar */}
      {totalCount > 0 && (
        <div className="mb-6 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${overallPct === 100 ? "bg-green-500" : "bg-blue-500"}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      )}

      {/* Search other paths panel */}
      {showSearch && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("path.searchPlaceholder")}
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={() => setShowSearch(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          {searchResults && searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                      {p.owner_name && (
                        <span className="font-medium text-gray-600 dark:text-gray-300 truncate max-w-[140px]">
                          {p.owner_name}
                        </span>
                      )}
                      {p.owner_name && <span className="text-gray-300 dark:text-gray-600">·</span>}
                      <span>{(p as any).topic_count ?? 0} {t("path.topicsCount", { count: (p as any).topic_count ?? 0 })}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => copyMutation.mutate(p.id)}
                    disabled={copyMutation.isPending}
                    className="flex-shrink-0 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors disabled:opacity-60"
                  >
                    {t("path.copy")}
                  </button>
                </div>
              ))}
            </div>
          ) : searchQuery.trim().length > 1 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">{t("path.noPathsFound")}</p>
          ) : null}
        </div>
      )}

      {/* Topic list */}
      <div className="space-y-3">
        {path.topics.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
            <AcademicCapIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">{t("path.noTopicsYet")}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{t("path.noTopicsSubtitle")}</p>
            <button
              onClick={() => setShowAddTopic(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              {t("path.addTopic")}
            </button>
          </div>
        ) : (
          path.topics.map((topic, index) => (
            <PathTopicCard
              key={topic.topic_id}
              topic={topic}
              index={index}
              total={path.topics.length}
              nativeLanguage={nativeLanguage}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              onRemove={() => {
                if (confirm(t("path.removeConfirm", { title: topic.topic_title }))) {
                  removeTopicMutation.mutate(topic.topic_id);
                }
              }}
            />
          ))
        )}
      </div>

      {/* Add topic button */}
      {path.topics.length > 0 && (
        <button
          onClick={() => setShowAddTopic(v => !v)}
          className="mt-4 w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
        >
          <PlusIcon className="w-4 h-4" /> {t("path.addTopic")}
        </button>
      )}

      {/* Add topic panel */}
      {showAddTopic && (
        <div className="mt-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-sm space-y-2">
          <input
            autoFocus
            type="text"
            value={topicSearch}
            onChange={e => setTopicSearch(e.target.value)}
            placeholder={t("path.searchTopicsPlaceholder")}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {availableTopics.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">
                {topicSearch ? t("path.noTopicsMatch") : t("path.allTopicsInPath")}
              </p>
            ) : (
              availableTopics.map(topic => (
                <button
                  key={topic.id}
                  onClick={() => addTopicMutation.mutate(topic.id)}
                  disabled={addTopicMutation.isPending}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="truncate">{resolveTopicTitle(topic, nativeLanguage)}</span>
                  <PlusIcon className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Path topic card ───────────────────────────────────────────────────────────

function PathTopicCard({ topic, index, total, onMoveUp, onMoveDown, onRemove, nativeLanguage }: {
  topic: PathTopic;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  nativeLanguage: string | null;
}) {
  const { t } = useTranslation();
  // Resolve display title: prefer native-language version title, fallback to first version title, then topic title
  const displayTitle = (() => {
    if (nativeLanguage && topic.topic_versions) {
      const match = topic.topic_versions.find(
        v => v.language_code.split("-")[0]!.toLowerCase() === nativeLanguage
      );
      if (match?.title) return match.title;
    }
    return topic.topic_versions?.find(v => v.title)?.title ?? topic.topic_title;
  })();
  const pct = topic.totalSentences > 0
    ? Math.round((topic.practicedSentences / topic.totalSentences) * 100)
    : 0;

  return (
    <div className={`group flex items-center gap-3 p-4 rounded-2xl border transition-all ${
      topic.isDone
        ? "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-60"
        : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700"
    }`}>
      {/* Position number */}
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">
        {index + 1}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {displayTitle}
          </p>
          {topic.isDone && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              <CheckIcon className="w-2.5 h-2.5" /> {t("path.done")}
            </span>
          )}
        </div>

        {/* Tags */}
        {topic.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {topic.tags.map(tag => (
              <span key={tag.id} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border"
                style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {topic.totalSentences > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-600"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
              {topic.practicedSentences}/{topic.totalSentences}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
        {/* Open button — always visible, matches TopicCard */}
        <Link
          to="/topics/$topicId"
          params={{ topicId: topic.topic_id }}
          search={{ from: "path" }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors"
        >
          {t("topicCard.open")} <ArrowRightIcon className="w-3 h-3" />
        </Link>
        {/* Reorder + remove — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onMoveUp} disabled={index === 0}
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 transition-colors">
            <ChevronUpIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 transition-colors">
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove}
            className="p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
