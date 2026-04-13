import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  PencilIcon, ArrowDownTrayIcon, PlayIcon,
  ChevronLeftIcon, ChevronRightIcon,
  XMarkIcon, Cog6ToothIcon,
  ArrowsUpDownIcon, CheckIcon, PlusIcon,
  ClipboardDocumentListIcon,
  PaperAirplaneIcon, XCircleIcon,
  ClockIcon, CheckCircleIcon, ExclamationCircleIcon, LockClosedIcon,
} from "@heroicons/react/24/outline";
import { api, type Version, type Tag } from "../../lib/api";
import { langFlag, langLabel } from "../../lib/lang";
import { SentenceList } from "../../components/topic/SentenceList";
import { AddLanguageModal } from "../../components/topic/AddLanguageModal";
import { VersionSettingsModal } from "../../components/topic/VersionSettingsModal";
import { useAuth } from "../../hooks/useAuth";
import { useUserLanguages } from "../../hooks/useUserLanguages";

export function TopicDetailPage() {
  const { t, i18n } = useTranslation();
  const { topicId } = useParams({ strict: false }) as { topicId: string };
  const search = useSearch({ strict: false }) as { from?: string };
  const backTo = search.from === "path" ? "/path" : "/topics";
  const backLabel = search.from === "path" ? t("nav.path") : t("topics.backLink");
  const qc = useQueryClient();
  const { user } = useAuth();

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [showAddLang, setShowAddLang] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [versionSettingsId, setVersionSettingsId] = useState<string | null>(null);

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // Inline version title/description editing
  const [editingVersionMeta, setEditingVersionMeta] = useState(false);
  const [versionTitleDraft, setVersionTitleDraft] = useState("");
  const [versionDescDraft, setVersionDescDraft] = useState("");

  // Description editing
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  // Tag editing
  const [editingTags, setEditingTags] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>([]);

  // Submit for review form
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitNote, setSubmitNote] = useState("");

  const { data: topic, isLoading, isError } = useQuery({
    queryKey: ["topic", topicId],
    queryFn: () => api.getTopic(topicId),
  });

  const canEdit = !!topic && !!user && (topic.owner_id === user.id || user.role === "admin");
  const { hasConfig, requiredLanguages, nativeLanguage } = useUserLanguages();

  const { data: allTags } = useQuery({
    queryKey: ["tags"],
    queryFn: api.getTags,
  });

  // Must be declared here (before any early returns) to satisfy Rules of Hooks.
  // We pre-compute the active version id using the same logic as below
  // (activeVersionId state ?? first version), so the query key stays in sync
  // with what the user actually sees — even on initial render when activeVersionId is null.
  const preActiveVersionId = (
    topic?.versions?.find((v) => v.id === activeVersionId)
    ?? topic?.versions?.[0]
  )?.id;
  const { data: recordingsCheck } = useQuery({
    queryKey: ["recordings-check", preActiveVersionId],
    queryFn: () => api.checkRecordings(preActiveVersionId!),
    enabled: !!preActiveVersionId,
  });

  const updateDescriptionMutation = useMutation({
    mutationFn: (description: string) => api.updateTopic(topicId, { description: description.trim() || undefined }),
    onSuccess: () => { setEditingDescription(false); qc.invalidateQueries({ queryKey: ["topic", topicId] }); },
  });

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => api.updateTopic(topicId, { title }),
    onSuccess: () => { setEditingTitle(false); qc.invalidateQueries({ queryKey: ["topic", topicId] }); },
  });

  const updateVersionMetaMutation = useMutation({
    mutationFn: ({ id, title, description }: { id: string; title: string | null; description: string | null }) =>
      api.updateVersion(id, { title, description }),
    onSuccess: () => { setEditingVersionMeta(false); qc.invalidateQueries({ queryKey: ["topic", topicId] }); },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (id: string) => api.deleteVersion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topic", topicId] }),
  });

  const setTagsMutation = useMutation({
    mutationFn: (tagIds: string[]) => api.setTopicTags(topic!.id, tagIds),
    onSuccess: () => { setEditingTags(false); qc.invalidateQueries({ queryKey: ["topic", topicId] }); },
  });

  // Pre-fetch latest approval request for this topic (owner only).
  // topic.status drives the UI; this call warms the cache for any future use.
  useQuery({
    queryKey: ["topic-approval", topicId],
    queryFn: () => api.getTopicApproval(topicId),
    enabled: canEdit && !!topic,
  });

  const submitMutation = useMutation({
    mutationFn: ({ note }: { note: string }) => api.submitForReview(topicId, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
      qc.invalidateQueries({ queryKey: ["topic-approval", topicId] });
      setShowSubmitForm(false);
      setSubmitNote("");
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => api.withdrawRequest(topicId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
      qc.invalidateQueries({ queryKey: ["topic-approval", topicId] });
    },
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-600 dark:text-red-400 font-medium">{t("topics.notFound")}</p>
          <Link to="/topics" className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">{t("topics.backToTopics")}</Link>
        </div>
      </div>
    );
  }

  // Block non-owners if topic doesn't match user's language config
  if (!canEdit && hasConfig && requiredLanguages.length > 0) {
    const topicLangs = (topic.versions ?? []).map(v => v.language_code.split("-")[0]!.toLowerCase());
    const qualifies = requiredLanguages.every(lang => topicLangs.includes(lang));
    if (!qualifies) {
      return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Link to={backTo} className="text-sm text-gray-400 hover:text-blue-500 transition-colors mb-4 inline-flex items-center gap-1">
            <ChevronLeftIcon className="w-4 h-4" /> {backLabel}
          </Link>
          <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6 text-center">
            <p className="text-amber-700 dark:text-amber-400 font-medium">{t("topics.notInLanguageConfig")}</p>
            <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">{t("topics.notInLanguageConfigHint")}</p>
            <Link to="/settings" className="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">{t("topics.goToSettings")}</Link>
          </div>
        </div>
      );
    }
  }

  // Sort versions — filter to required languages only if config set, otherwise show all
  const uiLang = i18n.language.split("-")[0]!.toLowerCase();
  const versions: Version[] = [...(topic.versions ?? [])].filter(v => {
    if (!hasConfig || canEdit) return true;
    return requiredLanguages.includes(v.language_code.split("-")[0]!.toLowerCase());
  }).sort((a, b) => {
    const aMatch = a.language_code.split("-")[0]!.toLowerCase() === uiLang ? 0 : 1;
    const bMatch = b.language_code.split("-")[0]!.toLowerCase() === uiLang ? 0 : 1;
    return aMatch - bMatch;
  });
  const activeVersion: Version | undefined =
    versions.find((v) => v.id === activeVersionId) ?? versions[0];

  // Only show the Review button when the check result belongs to the active version
  const hasRecordings = !!activeVersion &&
    preActiveVersionId === activeVersion.id &&
    (recordingsCheck?.hasAny ?? false);

  // Derive uiLang-matched display title/description
  const matchedVersion = versions.find((v) => v.language_code.split("-")[0] === uiLang);
  const displayTitle = matchedVersion?.title ?? versions[0]?.title ?? topic.title;
  const displayDescription = matchedVersion?.description ?? versions[0]?.description ?? topic.description;

  const startEditVersionMeta = () => {
    setVersionTitleDraft(activeVersion?.title ?? "");
    setVersionDescDraft(activeVersion?.description ?? "");
    setEditingVersionMeta(true);
  };

  const saveVersionMeta = () => {
    if (!activeVersion) return;
    updateVersionMetaMutation.mutate({
      id: activeVersion.id,
      title: versionTitleDraft.trim() || null,
      description: versionDescDraft.trim() || null,
    });
  };

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Breadcrumb */}
      <Link to={backTo} className="text-sm text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mb-4 inline-flex items-center gap-1">
        <ChevronLeftIcon className="w-4 h-4" /> {backLabel}
      </Link>

      {/* Topic header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-2 mb-6">
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
              className={`text-2xl font-bold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2 ${canEdit ? "cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors group" : ""}`}
              onClick={canEdit ? startEditTitle : undefined}
              title={canEdit ? t("topics.clickToEdit") : undefined}
            >
              {displayTitle}
              {canEdit && <PencilIcon className="w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity" />}
              {/* Status icon — shown to owner only */}
              {canEdit && (
                <TopicStatusIcon status={topic.status} rejectionNote={topic.rejection_note} />
              )}
            </h1>
          )}
          {/* Description */}
          {editingDescription ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={() => updateDescriptionMutation.mutate(descriptionDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingDescription(false);
                }}
                placeholder={t("createTopic.descriptionPlaceholder")}
                className="flex-1 text-sm bg-transparent border-b border-blue-500 text-gray-500 dark:text-gray-400 focus:outline-none"
              />
            </div>
          ) : (
            <div className="group/desc flex items-center gap-1 mt-1">
              {displayDescription
                ? <p className="text-sm text-gray-500 dark:text-gray-400">{displayDescription}</p>
                : canEdit && <p className="text-sm text-gray-400 dark:text-gray-600 italic">{t("createTopic.descriptionPlaceholder")}</p>
              }
              {canEdit && (
                <button
                  onClick={() => { setDescriptionDraft(topic.description ?? ""); setEditingDescription(true); }}
                  className="opacity-0 group-hover/desc:opacity-60 hover:!opacity-100 text-gray-400 hover:text-blue-500 transition-all"
                >
                  <PencilIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Tags + edit icon */}
          {(canEdit || (topic.tags ?? []).length > 0) && (
            <div className="mt-2">
              {editingTags ? (
                <div className="p-3 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(allTags ?? []).map(tag => {
                      const active = tagDraft.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setTagDraft(prev =>
                            active ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                          )}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                          style={active
                            ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                            : { backgroundColor: tag.color + "15", borderColor: tag.color, color: tag.color }
                          }
                        >{tag.name}</button>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingTags(false)}
                      className="text-xs px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {t("common.cancel")}
                    </button>
                    <button onClick={() => setTagsMutation.mutate(tagDraft)} disabled={setTagsMutation.isPending}
                      className="text-xs px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60">
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(topic.tags ?? []).map(tag => (
                    <span key={tag.id} className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                      style={{ backgroundColor: tag.color + "20", borderColor: tag.color, color: tag.color }}>
                      {tag.name}
                    </span>
                  ))}
                  {canEdit && (
                    <button
                      onClick={() => { setTagDraft((topic.tags ?? []).map(t => t.id)); setEditingTags(true); }}
                      className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                      title={t("topics.editTags", { defaultValue: "Edit tags" })}
                    >
                      <PencilIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export + Approval request + Practice buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 self-start">
          <button
            onClick={() => api.exportTopic(topicId, topic.title).catch(() => alert("Export failed"))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title={t("topics.exportTitle")}
          >
            <ArrowDownTrayIcon className="w-4 h-4" /> {t("topics.export")}
          </button>
          {/* Approval action button — owner only, not shown when published */}
          {canEdit && topic.status !== "published" && (
            topic.status === "pending" ? (
              <button
                onClick={() => withdrawMutation.mutate()}
                disabled={withdrawMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-40"
              >
                <XCircleIcon className="w-4 h-4" /> {t("topics.withdrawRequest")}
              </button>
            ) : (
              <button
                onClick={() => setShowSubmitForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <PaperAirplaneIcon className="w-4 h-4" /> {t("topics.submitForReview")}
              </button>
            )
          )}
          {activeVersion && !(nativeLanguage && activeVersion.language_code.split("-")[0]!.toLowerCase() === nativeLanguage) && (
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

      {/* Submit for review dialog */}
      {showSubmitForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t("topics.submitForReview")}
            </h3>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
                {t("topics.submitNote")}
              </label>
              <textarea
                autoFocus
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                placeholder={t("topics.submitNotePlaceholder")}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSubmitForm(false); setSubmitNote(""); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => submitMutation.mutate({ note: submitNote })}
                disabled={submitMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {submitMutation.isPending ? t("common.saving") : t("topics.submitConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language version tabs */}
      <div className="relative -mx-4 sm:mx-0">
        {/* Right fade hint — hints more tabs are off-screen */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-gray-50 dark:from-gray-950 to-transparent z-10 sm:hidden" />
        <div className="overflow-x-auto w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 min-w-max px-4 sm:px-0 snap-x snap-mandatory">
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
                className={`relative flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-3 sm:py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors snap-start ${
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <span>{langFlag(v.language_code)}</span>
                <span className="hidden min-[380px]:inline">{langLabel(v.language_code)}</span>
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
                {/* Delete version button (owner/admin only, hidden in reorder mode) */}
                {canEdit && !reorderMode && (
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
                {/* Version TTS settings (owner/admin only, hidden in reorder mode) */}
                {canEdit && !reorderMode && (
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

        {/* Reorder toggle button (owner/admin only) */}
        {canEdit && versions.length >= 2 && (
          <button
            onClick={() => setReorderMode((v) => !v)}
            className={`flex items-center gap-1 px-3 py-3 sm:py-2.5 text-xs border-b-2 border-transparent transition-colors whitespace-nowrap ${
              reorderMode
                ? "text-blue-600 dark:text-blue-400 font-semibold"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            title={reorderMode ? t("topics.doneReordering") : t("topics.reorderLanguages")}
          >
            {reorderMode ? <><CheckIcon className="w-3.5 h-3.5" /> {t("common.save")}</> : <ArrowsUpDownIcon className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Add language tab (owner/admin only) */}
        {canEdit && (
          <button
            onClick={() => setShowAddLang(true)}
            className="inline-flex items-center gap-1 px-3 py-3 sm:py-2.5 text-xs sm:text-sm text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border-b-2 border-transparent hover:border-blue-400 transition-colors whitespace-nowrap"
            title={t("topics.addLanguage")}
          >
            <PlusIcon className="w-4 h-4" /> {t("topics.addLanguage")}
          </button>
        )}
          </div>
        </div>
      </div>

      {/* Sentence list for active version */}
      <div className="mt-0 bg-white dark:bg-gray-900 rounded-b-xl border border-t-0 border-gray-200 dark:border-gray-800 p-3 sm:p-4">
        {versions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-400 dark:text-gray-600 text-sm mb-3">{t("topics.noVersions")}</p>
            {canEdit && (
              <button
                onClick={() => setShowAddLang(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
              >
                {t("topics.addLanguageBtn")}
              </button>
            )}
          </div>
        ) : activeVersion ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {langFlag(activeVersion.language_code)} {t("topics.sentencesLabel", { lang: activeVersion.language_code })}
              </span>
              {!(nativeLanguage && activeVersion.language_code.split("-")[0]!.toLowerCase() === nativeLanguage) && (
                <div className="flex items-center gap-2">
                  {hasRecordings && (
                    <Link
                      to="/practice/$topicId/$langCode/review"
                      params={{ topicId, langCode: activeVersion.language_code }}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors"
                    >
                      <ClipboardDocumentListIcon className="w-3.5 h-3.5" /> {t("topics.reviewThis")}
                    </Link>
                  )}
                  <Link
                    to="/practice/$topicId/$langCode"
                    params={{ topicId, langCode: activeVersion.language_code }}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                  >
                    <PlayIcon className="w-3.5 h-3.5" /> {t("topics.practiceThis")}
                  </Link>
                </div>
              )}
            </div>

            {/* Version title/description (localised) */}
            {editingVersionMeta ? (
              <div className="mb-3 space-y-1.5 p-3 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10">
                <input
                  autoFocus
                  type="text"
                  value={versionTitleDraft}
                  onChange={(e) => setVersionTitleDraft(e.target.value)}
                  placeholder={t("topics.versionTitlePlaceholder")}
                  className="w-full px-2 py-1 text-sm font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={versionDescDraft}
                  onChange={(e) => setVersionDescDraft(e.target.value)}
                  placeholder={t("topics.versionDescPlaceholder")}
                  className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingVersionMeta(false)}
                    className="text-xs px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={saveVersionMeta}
                    disabled={updateVersionMetaMutation.isPending}
                    className="text-xs px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            ) : (activeVersion.title || activeVersion.description) ? (
              <div className="mb-3 group/vmeta flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {activeVersion.title && (
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 leading-snug">{activeVersion.title}</p>
                  )}
                  {activeVersion.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{activeVersion.description}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={startEditVersionMeta}
                    className="opacity-0 group-hover/vmeta:opacity-60 hover:!opacity-100 text-gray-400 hover:text-blue-500 transition-all flex-shrink-0 mt-0.5"
                    title={t("topics.editVersionTitle")}
                  >
                    <PencilIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : canEdit ? (
              <button
                onClick={startEditVersionMeta}
                className="mb-3 text-xs text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
              >
                <PencilIcon className="w-3 h-3" /> {t("topics.addVersionTitle")}
              </button>
            ) : null}
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
              allVersions={versions}
              activeLangCode={activeVersion.language_code}
              canEdit={canEdit}
              isNative={!!nativeLanguage && activeVersion.language_code.split("-")[0]!.toLowerCase() === nativeLanguage}
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

/** Small icon shown inline in the topic title — indicates publish status to the owner */
function TopicStatusIcon({ status, rejectionNote }: {
  status: "private" | "pending" | "published" | "rejected";
  rejectionNote: string | null;
}) {
  const { t } = useTranslation();

  const config = {
    private:   { Icon: LockClosedIcon,       cls: "text-gray-400 dark:text-gray-500",           title: t("topics.private") },
    pending:   { Icon: ClockIcon,             cls: "text-amber-500 dark:text-amber-400",         title: t("topics.pendingReview") },
    published: { Icon: CheckCircleIcon,       cls: "text-green-500 dark:text-green-400",         title: t("topics.published") },
    rejected:  { Icon: ExclamationCircleIcon, cls: "text-red-500 dark:text-red-400",             title: rejectionNote ? t("topics.rejectionNote", { note: rejectionNote }) : t("topics.rejected") },
  };

  const { Icon, cls, title } = config[status];
  return <Icon className={`w-5 h-5 flex-shrink-0 ${cls}`} title={title} />;
}

function TopicDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-pulse">
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
