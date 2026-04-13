import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { api, type AdminTopic, type ApprovalRequestWithTopic } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

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

// ── Status Badge ──────────────────────────────────────────────────────────────

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

// ── Language Pills ────────────────────────────────────────────────────────────

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

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectPanel({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: (note: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");

  return (
    <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl space-y-2">
      <label className="block text-xs font-medium text-red-700 dark:text-red-400">
        {t("admin.rejectNote")}
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("admin.rejectNotePlaceholder")}
        rows={2}
        className="w-full text-xs rounded-lg border border-red-200 dark:border-red-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-2 py-1.5 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {t("common.cancel")}
        </button>
        <button
          disabled={isPending || !note.trim()}
          onClick={() => onConfirm(note.trim())}
          className="px-3 py-1 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-40"
        >
          {t("admin.rejectConfirm")}
        </button>
      </div>
    </div>
  );
}

// ── Approval Queue Section ────────────────────────────────────────────────────

function ApprovalQueueSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery<ApprovalRequestWithTopic[]>({
    queryKey: ["admin-approvals"],
    queryFn: api.listPendingApprovals,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => api.approveRequest(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      qc.invalidateQueries({ queryKey: ["admin-topics"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note: string }) =>
      api.rejectRequest(requestId, note),
    onSuccess: () => {
      setRejectingId(null);
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      qc.invalidateQueries({ queryKey: ["admin-topics"] });
    },
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

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("admin.approvalQueueEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.owner")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.languages")}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.sentences")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.submittedAt")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.ownerNote")}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {requests.map((req) => {
                  const langCodes = req.language_codes
                    ? req.language_codes.split(",").map((s) => s.trim()).filter(Boolean)
                    : [];

                  return (
                    <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors align-top">
                      {/* Title */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                          {req.topic_title}
                        </span>
                        {req.topic_description && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">
                            {req.topic_description}
                          </p>
                        )}
                      </td>

                      {/* Owner */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[120px]">
                          {req.owner_name ?? "—"}
                        </p>
                        {req.owner_email && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
                            {req.owner_email}
                          </p>
                        )}
                      </td>

                      {/* Languages */}
                      <td className="px-4 py-3">
                        <LangPills codes={langCodes} />
                      </td>

                      {/* Sentences */}
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {req.sentence_count}
                      </td>

                      {/* Submitted */}
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(req.created_at)}
                      </td>

                      {/* Note */}
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[160px]">
                        {req.note ? (
                          <span className="text-xs line-clamp-2">{req.note}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-1.5">
                            <button
                              disabled={approveMutation.isPending}
                              onClick={() => approveMutation.mutate(req.id)}
                              className="px-3 py-1 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors disabled:opacity-40"
                            >
                              ✓ {t("admin.approve")}
                            </button>
                            <button
                              disabled={rejectMutation.isPending}
                              onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                              className="px-3 py-1 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                            >
                              ✗ {t("admin.reject")}
                            </button>
                          </div>
                          {rejectingId === req.id && (
                            <div className="w-56">
                              <RejectPanel
                                isPending={rejectMutation.isPending}
                                onCancel={() => setRejectingId(null)}
                                onConfirm={(note) => rejectMutation.mutate({ requestId: req.id, note })}
                              />
                            </div>
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
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit mb-4 flex-wrap">
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
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("admin.noTopics")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Title</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.owner")}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.languages")}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.sentences")}</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.status")}</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
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
                          </td>

                          {/* Owner */}
                          <td className="px-4 py-3">
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
                          <td className="px-4 py-3">
                            <LangPills codes={langCodes} />
                          </td>

                          {/* Sentences */}
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
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

                          {/* Actions */}
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold text-red-700 dark:text-red-400">403 — Forbidden</p>
          <p className="text-sm text-red-500 dark:text-red-500 mt-1">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
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

      {/* Section A — Approval Queue */}
      <ApprovalQueueSection />

      {/* Section B — All Topics */}
      <AllTopicsSection />
    </div>
  );
}
