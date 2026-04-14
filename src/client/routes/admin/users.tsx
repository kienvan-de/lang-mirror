import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { api, type AdminUser } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

// ── helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function lastActiveColor(last_active_at: string | null): string {
  if (!last_active_at) return "text-gray-400 dark:text-gray-500";
  const days = daysSince(last_active_at);
  if (days > 90) return "text-red-600 dark:text-red-400";
  if (days > 30) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type Filter = "all" | "active" | "inactive";

function filterUsers(users: AdminUser[], filter: Filter): AdminUser[] {
  const cutoff30 = Date.now() - 30 * 86_400_000;
  if (filter === "active") return users.filter((u) => u.last_active_at && new Date(u.last_active_at).getTime() >= cutoff30);
  if (filter === "inactive") return users.filter((u) => !u.last_active_at || new Date(u.last_active_at).getTime() < cutoff30);
  return users;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: api.adminListUsers,
    enabled: currentUser?.role === "admin",
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "user" | "admin" }) =>
      api.updateUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.deactivateUser(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.activateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

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

  const filtered = filterUsers(users, filter);

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all", label: t("admin.filterAll") },
    { key: "active", label: t("admin.filterActive") },
    { key: "inactive", label: t("admin.filterInactive") },
  ];

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("admin.users")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("admin.usersSubtitle")}</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit mb-6 flex-wrap">
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t("admin.noUsers")}</div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.name")}</th>
                  <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.email")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.role")}</th>
                  <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.joined")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.lastActive")}</th>
                  <th className="hidden sm:table-cell text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.topicCount")}</th>
                  <th className="hidden sm:table-cell text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.attempts")}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filtered.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      {/* Avatar + Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.name ?? ""} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
                              {(u.name ?? u.email ?? "?")[0]?.toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[120px]">
                                {u.name ?? "—"}
                              </span>
                              {isSelf && <span className="text-xs text-blue-500">(you)</span>}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 sm:hidden truncate max-w-[140px]">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email — hidden on mobile */}
                      <td className="hidden sm:table-cell px-4 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[160px]">
                        {u.email ?? "—"}
                      </td>

                      {/* Role + status badges */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            u.role === "admin"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          }`}>
                            {u.role}
                          </span>
                          {u.is_active === 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                              title={u.deactivation_reason ?? ""}>
                              {t("admin.deactivated")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Joined — hidden on mobile */}
                      <td className="hidden sm:table-cell px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(u.created_at)}
                      </td>

                      {/* Last Active */}
                      <td className={`px-4 py-3 whitespace-nowrap font-medium ${lastActiveColor(u.last_active_at)}`}>
                        {u.last_active_at ? formatDate(u.last_active_at) : t("admin.neverActive")}
                      </td>

                      {/* Topics — hidden on mobile */}
                      <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {u.topic_count}
                      </td>

                      {/* Attempts — hidden on mobile */}
                      <td className="hidden sm:table-cell px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {u.attempt_count}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Toggle role */}
                          <button
                            disabled={isSelf || updateRoleMutation.isPending}
                            title={isSelf ? t("admin.cannotEditSelf") : u.role === "admin" ? t("admin.demote") : t("admin.promote")}
                            onClick={() => {
                              const newRole = u.role === "admin" ? "user" : "admin";
                              updateRoleMutation.mutate({ id: u.id, role: newRole });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              u.role === "admin"
                                ? "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                                : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                            }`}
                          >
                            {u.role === "admin" ? t("admin.demote") : t("admin.promote")}
                          </button>

                          {/* Deactivate / Activate */}
                          {u.is_active === 0 ? (
                            <button
                              disabled={activateMutation.isPending}
                              onClick={() => activateMutation.mutate(u.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 transition-colors disabled:opacity-40"
                              title={t("admin.activateUser")}
                            >
                              {t("admin.activateUser")}
                            </button>
                          ) : (
                            <button
                              disabled={isSelf || deactivateMutation.isPending}
                              onClick={() => { setDeactivateTarget(u); setDeactivateReason(""); }}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={isSelf ? t("admin.cannotEditSelf") : t("admin.deactivateUser")}
                            >
                              {t("admin.deactivateUser")}
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            disabled={isSelf || deleteUserMutation.isPending}
                            title={isSelf ? t("admin.cannotEditSelf") : t("admin.deleteUser")}
                            onClick={() => {
                              if (confirm(t("admin.deleteUserConfirm"))) {
                                deleteUserMutation.mutate(u.id);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {t("admin.deleteUser")}
                          </button>
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

      {/* Deactivate user modal */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {t("admin.deactivateConfirmTitle", { name: deactivateTarget.name ?? deactivateTarget.email ?? deactivateTarget.id })}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("admin.deactivateConfirmBody")}
            </p>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">
                {t("admin.deactivateReasonLabel")}
              </label>
              <textarea
                rows={3}
                value={deactivateReason}
                onChange={e => setDeactivateReason(e.target.value)}
                placeholder={t("admin.deactivateReasonPlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDeactivateTarget(null); setDeactivateReason(""); }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={deactivateMutation.isPending}
                onClick={() => {
                  deactivateMutation.mutate(
                    { id: deactivateTarget.id, reason: deactivateReason },
                    { onSuccess: () => { setDeactivateTarget(null); setDeactivateReason(""); } }
                  );
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {t("admin.deactivateConfirmOk")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
