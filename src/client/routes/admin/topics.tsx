import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { api, type AdminTopic } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type Filter = "all" | "published" | "private";

function filterTopics(topics: AdminTopic[], filter: Filter): AdminTopic[] {
  if (filter === "published") return topics.filter((t) => t.published === 1);
  if (filter === "private") return topics.filter((t) => t.published !== 1);
  return topics;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminTopicsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: topics = [], isLoading } = useQuery<AdminTopic[]>({
    queryKey: ["admin-topics"],
    queryFn: api.adminListTopics,
    enabled: currentUser?.role === "admin",
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.publishTopic(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-topics"] }),
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => api.unpublishTopic(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-topics"] }),
  });

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

  const filtered = filterTopics(topics, filter);

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all", label: t("admin.filterAll") },
    { key: "published", label: t("admin.filterPublished") },
    { key: "private", label: t("admin.filterPrivate") },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
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

      {/* Filter bar */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit mb-6">
        {filterTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
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
                  const isPublished = topic.published === 1;
                  const langCodes = (topic.versions ?? []).map((v) => v.language_code);

                  return (
                    <tr key={topic.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      {/* Title */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                          {topic.title}
                        </span>
                        {topic.description && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{topic.description}</p>
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

                      {/* Language pills */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {langCodes.length === 0 ? (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          ) : (
                            langCodes.map((code) => (
                              <span
                                key={code}
                                className="px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                              >
                                {code.split("-")[0]?.toUpperCase()}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Sentences */}
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {topic.sentence_count}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {isPublished ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                              {t("admin.published")}
                            </span>
                            {topic.published_at && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {t("admin.publishedOn")} {formatDate(topic.published_at)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {t("admin.private")}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {isPublished ? (
                            <button
                              disabled={unpublishMutation.isPending}
                              onClick={() => unpublishMutation.mutate(topic.id)}
                              className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                            >
                              {t("admin.unpublish")}
                            </button>
                          ) : (
                            <button
                              disabled={publishMutation.isPending}
                              onClick={() => publishMutation.mutate(topic.id)}
                              className="px-3 py-1 rounded-lg text-xs font-medium border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors disabled:opacity-40"
                            >
                              {t("admin.publish")}
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
    </div>
  );
}
