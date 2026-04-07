import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  PencilIcon, ArrowDownTrayIcon, PlayIcon,
  ChevronLeftIcon, ChevronRightIcon,
  XMarkIcon, Cog6ToothIcon,
  ArrowsUpDownIcon, CheckIcon, PlusIcon,
} from "@heroicons/react/24/outline";
import { api, type Version } from "../../lib/api";
import { langFlag, langLabel } from "../../lib/lang";
import { SentenceList } from "../../components/topic/SentenceList";
import { AddLanguageModal } from "../../components/topic/AddLanguageModal";
import { VersionSettingsModal } from "../../components/topic/VersionSettingsModal";

export function TopicDetailPage() {
  const { t } = useTranslation();
  const { topicId } = useParams({ strict: false }) as { topicId: string };
  const qc = useQueryClient();

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [showAddLang, setShowAddLang] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [versionSettingsId, setVersionSettingsId] = useState<string | null>(null);

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  const { data: topic, isLoading, isError } = useQuery({
    queryKey: ["topic", topicId],
    queryFn: () => api.getTopic(topicId),
  });

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => api.updateTopic(topicId, { title }),
    onSuccess: () => { setEditingTitle(false); qc.invalidateQueries({ queryKey: ["topic", topicId] }); },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (id: string) => api.deleteVersion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic", topicId] }),
  });

  const reorderVersionsMutation = useMutation({
    mutationFn: (ids: string[]) => api.reorderVersions(topicId, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["topic", topicId] });
      const prev = qc.getQueryData(["topic", topicId]);
      qc.setQueryData(["topic", topicId], (old: typeof topic) => {
        if (!old) return old;
        const sorted = [...(old.versions ?? [])].sort(
          (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
        );
        return { ...old, versions: sorted };
      });
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(["topic", topicId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["topic", topicId] }),
  });

  if (isLoading) return <TopicDetailSkeleton />;
  if (isError || !topic) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{t("topics.notFound")}</p>
          <Link to="/topics" className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">{t("topics.backToTopics")}</Link>
        </div>
      </div>
    );
  }

  const versions: Version[] = topic.versions ?? [];
  const activeVersion: Version | undefined =
    versions.find((v) => v.id === activeVersionId) ?? versions[0];

  const startEditTitle = () => {
    setTitleDraft(topic.title);
    setEditingTitle(true);
    setTimeout(() => titleRef.current?.select(), 0);
  };

  const saveTitle = () => {
    if (titleDraft.trim() && titleDraft.trim() !== topic.title) {
      updateTitleMutation.mutate(titleDraft.trim());
    } else {
      setEditingTitle(false);
    }
  };

  const handleTitleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveTitle();
    if (e.key === "Escape") setEditingTitle(false);
  };

  const moveVersion = (versionId: string, direction: "up" | "down") => {
    const idx = versions.findIndex((v) => v.id === versionId);
    if (idx < 0) return;
    const newVersions = [...versions];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newVersions.length) return;
    [newVersions[idx], newVersions[swapIdx]] = [newVersions[swapIdx]!, newVersions[idx]!];
    reorderVersionsMutation.mutate(newVersions.map((v) => v.id));
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <Link to="/topics" className="text-sm text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mb-4 inline-flex items-center gap-1">
        <ChevronLeftIcon className="w-4 h-4" /> {t("topics.backLink")}
      </Link>

      {/* Topic header */}
      <div className="flex items-start justify-between gap-4 mt-2 mb-6">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={handleTitleKey}
              className="text-2xl font-bold w-full bg-transparent border-b-2 border-blue-500 text-gray-900 dark:text-gray-100 focus:outline-none"
            />
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors group inline-flex items-center gap-2"
              onClick={startEditTitle}
              title={t("topics.clickToEdit")}
            >
              {topic.title}
              <PencilIcon className="w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity" />
            </h1>
          )}
          {topic.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{topic.description}</p>
          )}
        </div>

        {/* Export + Practice button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => api.exportTopic(topicId, topic.title).catch(() => alert("Export failed"))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title={t("topics.exportTitle")}
          >
            <ArrowDownTrayIcon className="w-4 h-4" /> {t("topics.export")}
          </button>
          {activeVersion && (
            <Link
              to="/practice/$topicId/$langCode"
              params={{ topicId, langCode: activeVersion.language_code }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-semibold text-white transition-colors shadow-sm"
            >
              <PlayIcon className="w-4 h-4" /> {t("topics.practice")}
            </Link>
          )}
        </div>
      </div>

      {/* Language version tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-0 overflow-x-auto">
        {versions.map((v, idx) => {
          const isActive = v.id === (activeVersion?.id);
          return (
            <div key={v.id} className="group relative flex items-center">
              {/* Reorder arrows (shown in reorder mode) */}
              {reorderMode && (
                <div className="flex flex-col mr-0.5">
                  <button
                    onClick={() => moveVersion(v.id, "up")}
                    disabled={idx === 0}
                    className="w-4 h-3.5 text-gray-400 hover:text-blue-500 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center"
                    title={t("topics.moveLeft")}
                  ><ChevronLeftIcon className="w-3 h-3" /></button>
                  <button
                    onClick={() => moveVersion(v.id, "down")}
                    disabled={idx === versions.length - 1}
                    className="w-4 h-3.5 text-gray-400 hover:text-blue-500 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center"
                    title={t("topics.moveRight")}
                  ><ChevronRightIcon className="w-3 h-3" /></button>
                </div>
              )}
              <button
                onClick={() => setActiveVersionId(v.id)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <span>{langFlag(v.language_code)}</span>
                <span>{langLabel(v.language_code)}</span>
                {/* Sentence count badge */}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                }`}>
                  {v.sentences?.length ?? "…"}
                </span>
                {/* Today's progress dot */}
                {(v.progressToday ?? 0) > 0 && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      v.progressToday === 100 ? "bg-green-500" : "bg-blue-400"
                    }`}
                    title={t("topics.progressToday", { practiced: v.practicedToday, total: v.totalSentences })}
                  />
                )}
                {/* Delete version button (hidden in reorder mode) */}
                {!reorderMode && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t("topics.deleteVersionConfirm", { lang: langLabel(v.language_code) }))) {
                        deleteVersionMutation.mutate(v.id);
                        if (activeVersionId === v.id) setActiveVersionId(null);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 ml-1 text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-all"
                    title={t("topics.removeLanguageTitle")}
                    role="button"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </span>
                )}
                {/* Version TTS settings (hidden in reorder mode) */}
                {!reorderMode && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setVersionSettingsId(v.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 ml-0.5 text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-all"
                    title={t("topics.voiceSettingsTitle")}
                    role="button"
                  >
                    <Cog6ToothIcon className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Reorder toggle button */}
        {versions.length >= 2 && (
          <button
            onClick={() => setReorderMode((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-2.5 text-xs border-b-2 border-transparent transition-colors whitespace-nowrap ${
              reorderMode
                ? "text-blue-600 dark:text-blue-400 font-semibold"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            title={reorderMode ? t("topics.doneReordering") : t("topics.reorderLanguages")}
          >
            {reorderMode ? <><CheckIcon className="w-3.5 h-3.5" /> {t("common.save")}</> : <ArrowsUpDownIcon className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Add language tab */}
        <button
          onClick={() => setShowAddLang(true)}
          className="inline-flex items-center gap-1 px-3 py-2.5 text-sm text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border-b-2 border-transparent hover:border-blue-400 transition-colors whitespace-nowrap"
          title={t("topics.addLanguage")}
        >
          <PlusIcon className="w-4 h-4" /> {t("topics.addLanguage")}
        </button>
      </div>

      {/* Sentence list for active version */}
      <div className="mt-0 bg-white dark:bg-gray-900 rounded-b-xl border border-t-0 border-gray-200 dark:border-gray-800 p-4">
        {versions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-400 dark:text-gray-600 text-sm mb-3">{t("topics.noVersions")}</p>
            <button
              onClick={() => setShowAddLang(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              {t("topics.addLanguageBtn")}
            </button>
          </div>
        ) : activeVersion ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {langFlag(activeVersion.language_code)} {t("topics.sentencesLabel", { lang: activeVersion.language_code })}
              </span>
              <Link
                to="/practice/$topicId/$langCode"
                params={{ topicId, langCode: activeVersion.language_code }}
                className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
              >
                <PlayIcon className="w-3.5 h-3.5" /> {t("topics.practiceThis")}
              </Link>
            </div>
            {/* Today's progress bar */}
            {(activeVersion.totalSentences ?? 0) > 0 && (
              <div className="mb-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      activeVersion.progressToday === 100
                        ? "bg-green-500"
                        : (activeVersion.progressToday ?? 0) > 0
                          ? "bg-blue-500"
                          : ""
                    }`}
                    style={{ width: `${activeVersion.progressToday ?? 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {t("topics.progressToday", { practiced: activeVersion.practicedToday ?? 0, total: activeVersion.totalSentences })}
                </span>
              </div>
            )}
            <SentenceList
              sentences={activeVersion.sentences ?? []}
              versionId={activeVersion.id}
              topicId={topicId}
            />
          </>
        ) : null}
      </div>

      {showAddLang && (
        <AddLanguageModal topicId={topicId} onClose={() => setShowAddLang(false)} />
      )}
      {versionSettingsId && (() => {
        const v = versions.find((ver) => ver.id === versionSettingsId);
        return v ? (
          <VersionSettingsModal
            version={v}
            onClose={() => setVersionSettingsId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}

function TopicDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-pulse">
      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
      <div className="h-8 w-56 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-4 w-80 bg-gray-100 dark:bg-gray-800 rounded mb-6" />
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-0">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-20 bg-gray-100 dark:bg-gray-800 rounded-t" />
        ))}
      </div>
      <div className="mt-0 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 dark:bg-gray-800 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
