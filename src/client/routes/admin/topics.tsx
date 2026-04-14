import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon,
  XMarkIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { api, type AdminTopic, type ApprovalRequestWithTopic, type Topic, type Version } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { SentenceList } from "../../components/topic/SentenceList";
import { langFlag, langLabel } from "../../lib/lang";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type TopicFilter = "all" | "published" | "pending" | "rejected" | "private";

function filterTopics(topics: AdminTopic[], filter: TopicFilter): AdminTopic[] {
  if (filter === "all") return topics;
  return topics.filter((t) => t.status === filter);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function LangPills({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span
          key={code}
          className="px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          {code.split("-")[0]?.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status, rejectionNote }: { status: AdminTopic["status"]; rejectionNote: string | null }) {
  const { t } = useTranslation();

  const styles: Record<AdminTopic["status"], string> = {
    published: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    pending:   "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    rejected:  "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    private:   "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  };

  const labels: Record<AdminTopic["status"], string> = {
    published: t("admin.published"),
    pending:   t("admin.pending"),
    rejected:  t("admin.rejected"),
    private:   t("admin.private"),
  };

  return (
    <div>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
        {labels[status]}
      </span>
      {status === "rejected" && rejectionNote && (
        <p className="text-xs text-red-400 dark:text-red-500 mt-0.5 max-w-[180px] line-clamp-2">{rejectionNote}</p>
      )}
    </div>
  );
}

// ── Review Modal ──────────────────────────────────────────────────────────────
// Full-topic review modal consistent with other modals in the app
// (same fixed inset-0 z-50 flex items-center justify-center pattern).
// Shows full topic content via SentenceList + approve/reject at the bottom.

function ReviewModal({
  request,
  onClose,
  onApproved,
  onRejected,
}: {
  request: ApprovalRequestWithTopic;
  onClose: () => void;
  onApproved: () => void;
  onRejected: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);

  // Fetch full topic with versions + sentences
  const { data: topic, isLoading } = useQuery<Topic>({
    queryKey: ["topic", request.topic_id],
    queryFn: () => api.getTopic(request.topic_id),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.approveRequest(request.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      qc.invalidateQueries({ queryKey: ["admin-topics"] });
      qc.invalidateQueries({ queryKey: ["topic", request.topic_id] });
      onApproved();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.rejectRequest(request.id, rejectNote),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      qc.invalidateQueries({ queryKey: ["admin-topics"] });
      qc.invalidateQueries({ queryKey: ["topic", request.topic_id] });
      onRejected();
    },
  });

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const versions: Version[] = topic?.versions ?? [];
  const activeVersion = versions[activeVersionIdx] ?? versions[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-300 dark:border-gray-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1 uppercase tracking-wide">
              {t("admin.approvalQueue")}
            </p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {request.topic_title}
            </h2>
            {request.topic_description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                {request.topic_description}
              </p>
            )}
            {/* Meta row */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{t("admin.owner")}:</span>{" "}
                {request.owner_name ?? "—"}
                {request.owner_email && ` (${request.owner_email})`}
              </span>
              <span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{t("admin.submittedAt")}:</span>{" "}
                {formatDate(request.created_at)}
              </span>
              <span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{t("admin.sentences")}:</span>{" "}
                {request.sentence_count}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Owner note */}
          {request.note && (
            <div className="mx-6 mt-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                {t("admin.ownerNote")}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{request.note}</p>
            </div>
          )}

          {/* Topic content */}
          {isLoading ? (
            <div className="p-10 text-center text-sm text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
          ) : versions.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400 dark:text-gray-500">{t("admin.noVersions")}</div>
          ) : (
            <div className="px-6 py-4">
              {/* Version tabs */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {versions.map((v, idx) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVersionIdx(idx)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      idx === activeVersionIdx
                        ? "bg-blue-600 text-white"
                        : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span>{langFlag(v.language_code)}</span>
                    <span>{langLabel(v.language_code)}</span>
                    <span className="text-xs opacity-70">({v.sentences?.length ?? 0})</span>
                  </button>
                ))}
                {/* Prev / Next for keyboard nav feel */}
                {versions.length > 1 && (
                  <div className="ml-auto flex gap-1">
                    <button
                      disabled={activeVersionIdx === 0}
                      onClick={() => setActiveVersionIdx(i => Math.max(0, i - 1))}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <button
                      disabled={activeVersionIdx === versions.length - 1}
                      onClick={() => setActiveVersionIdx(i => Math.min(versions.length - 1, i + 1))}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Sentence list — read-only */}
              {activeVersion && (
                <SentenceList
                  key={activeVersion.id}
                  sentences={activeVersion.sentences ?? []}
                  versionId={activeVersion.id}
                  topicId={request.topic_id}
                  allVersions={versions}
                  activeLangCode={activeVersion.language_code}
                  canEdit={false}
                />
              )}
            </div>
          )}

          {/* Reject form — inline in the modal body */}
          {showRejectForm && (
            <div className="mx-6 mb-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{t("admin.rejectNote")}</p>
              <textarea
                autoFocus
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t("admin.rejectNotePlaceholder")}
                rows={3}
                className="w-full text-sm rounded-lg border border-red-200 dark:border-red-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowRejectForm(false); setRejectNote(""); }}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  disabled={rejectMutation.isPending || !rejectNote.trim()}
                  onClick={() => rejectMutation.mutate()}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-40"
                >
                  {rejectMutation.isPending ? t("common.saving") : t("admin.rejectConfirm")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky footer: Approve / Reject ── */}
        {!showRejectForm && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex gap-3">
            <button
              disabled={rejectMutation.isPending || approveMutation.isPending}
              onClick={() => setShowRejectForm(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 font-semibold text-sm transition-colors disabled:opacity-40"
            >
              <XMarkIcon className="w-4 h-4" /> {t("admin.reject")}
            </button>
            <button
              disabled={approveMutation.isPending || rejectMutation.isPending}
              onClick={() => approveMutation.mutate()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors disabled:opacity-40"
            >
              <CheckIcon className="w-4 h-4" />
              {approveMutation.isPending ? t("common.saving") : t("admin.approve")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Approval Queue Section ────────────────────────────────────────────────────

function ApprovalQueueSection() {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState<ApprovalRequestWithTopic | null>(null);

  const { data: requests = [], isLoading } = useQuery<ApprovalRequestWithTopic[]>({
    queryKey: ["admin-approvals"],
    queryFn: api.listPendingApprovals,
  });

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("admin.approvalQueue")}
        </h2>
        {requests.length > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
            {requests.length}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("admin.approvalQueueSubtitle")}</p>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("admin.approvalQueueEmpty")}</div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    {t("admin.topics")}
                  </th>
                  <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    {t("admin.owner")}
                  </th>
                  <th className="hidden md:table-cell text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    {t("admin.submittedAt")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    {t("admin.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    {/* Title */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                        {req.topic_title}
                      </p>
                      {/* Owner inline on mobile */}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:hidden truncate">
                        {req.owner_name ?? "—"}
                      </p>
                    </td>

                    {/* Owner — hidden on mobile */}
                    <td className="hidden sm:table-cell px-4 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[140px]">
                        {req.owner_name ?? "—"}
                      </p>
                      {req.owner_email && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[140px]">
                          {req.owner_email}
                        </p>
                      )}
                    </td>

                    {/* Submitted — hidden on mobile */}
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </td>

                    {/* Single Review button */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setReviewing(req)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      >
                        {t("admin.review")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewing && (
        <ReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onApproved={() => setReviewing(null)}
          onRejected={() => setReviewing(null)}
        />
      )}
    </section>
  );
}

// ── All Topics Section ────────────────────────────────────────────────────────

function AllTopicsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<TopicFilter>("all");
  const [collapsed, setCollapsed] = useState(false);

  const { data: topics = [], isLoading } = useQuery<AdminTopic[]>({
    queryKey: ["admin-topics"],
    queryFn: api.adminListTopics,
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => api.unpublishTopic(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-topics"] }),
  });

  const filtered = filterTopics(topics, filter);

  const filterTabs: { key: TopicFilter; label: string }[] = [
    { key: "all",       label: t("admin.filterAll") },
    { key: "published", label: t("admin.filterPublished") },
    { key: "pending",   label: t("admin.filterPending") },
    { key: "rejected",  label: t("admin.filterRejected") },
    { key: "private",   label: t("admin.filterPrivate") },
  ];

  return (
    <section>
      {/* Section header — collapsible */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between mb-4 group"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("admin.allTopics")}
          </h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            {topics.length}
          </span>
        </div>
        {collapsed
          ? <ChevronDownIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          : <ChevronUpIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        }
      </button>

      {!collapsed && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit mb-4 flex-wrap gap-y-1">
            {filterTabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === key
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("admin.noTopics")}</div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Title</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.owner")}</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.languages")}</th>
                      <th className="hidden md:table-cell text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.sentences")}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.status")}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filtered.map((topic) => {
                      const langCodes = (topic.versions ?? []).map((v) => v.language_code);

                      return (
                        <tr key={topic.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors align-top">
                          {/* Title */}
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                              {topic.title}
                            </span>
                            {topic.description && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">
                                {topic.description}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:hidden truncate max-w-[160px]">
                              {topic.owner_name ?? "—"}
                            </p>
                          </td>

                          {/* Owner */}
                          <td className="hidden sm:table-cell px-4 py-3">
                            <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[120px]">
                              {topic.owner_name ?? "—"}
                            </p>
                            {topic.owner_email && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
                                {topic.owner_email}
                              </p>
                            )}
                          </td>

                          {/* Languages */}
                          <td className="hidden sm:table-cell px-4 py-3">
                            <LangPills codes={langCodes} />
                          </td>

                          {/* Sentences */}
                          <td className="hidden md:table-cell px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                            {topic.sentence_count}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <StatusBadge status={topic.status} rejectionNote={topic.rejection_note} />
                            {topic.status === "published" && topic.status_updated_at && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {t("admin.publishedOn", { date: formatDate(topic.status_updated_at) })}
                              </p>
                            )}
                          </td>

                          {/* Actions — only unpublish for published topics */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              {topic.status === "published" && (
                                <button
                                  disabled={unpublishMutation.isPending}
                                  onClick={() => unpublishMutation.mutate(topic.id)}
                                  className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                                >
                                  {t("admin.unpublish")}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminTopicsPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  if (currentUser?.role !== "admin") {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold text-red-700 dark:text-red-400">403 — Forbidden</p>
          <p className="text-sm text-red-500 dark:text-red-500 mt-1">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {t("admin.backToAdmin")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("admin.topics")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("admin.topicsSubtitle")}</p>
      </div>

      <ApprovalQueueSection />
      <AllTopicsSection />
    </div>
  );
}
