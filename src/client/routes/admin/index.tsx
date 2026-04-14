import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { UsersIcon, BookOpenIcon, TagIcon } from "@heroicons/react/24/outline";
import { api, type AdminUser, type AdminTopic, type ApprovalRequestWithTopic } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

// ── helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function isActiveWithin(user: AdminUser, days: number): boolean {
  if (!user.last_active_at) return false;
  return new Date(user.last_active_at) >= daysAgo(days);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-5 shadow-sm flex flex-col gap-1">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

function QuickCard({
  icon,
  title,
  subtitle,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-6 shadow-sm hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <p className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {title}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: api.adminListUsers,
    enabled: user?.role === "admin",
  });

  const { data: topics = [] } = useQuery<AdminTopic[]>({
    queryKey: ["admin-topics"],
    queryFn: api.adminListTopics,
    enabled: user?.role === "admin",
  });

  const { data: pendingApprovals = [] } = useQuery<ApprovalRequestWithTopic[]>({
    queryKey: ["admin-approvals"],
    queryFn: api.listPendingApprovals,
    enabled: user?.role === "admin",
  });

  if (user?.role !== "admin") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold text-red-700 dark:text-red-400">403 — Forbidden</p>
          <p className="text-sm text-red-500 dark:text-red-500 mt-1">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const totalUsers = users.length;
  const active7d = users.filter((u) => isActiveWithin(u, 7)).length;
  const active30d = users.filter((u) => isActiveWithin(u, 30)).length;
  const totalTopics = topics.length;
  const pendingCount = pendingApprovals.length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("admin.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("admin.subtitle")}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label={t("admin.totalUsers")} value={totalUsers} />
        <StatCard label={t("admin.activeUsers7d")} value={active7d} />
        <StatCard label={t("admin.activeUsers30d")} value={active30d} />
        <StatCard label={t("admin.totalTopics")} value={totalTopics} />
        <StatCard label={t("admin.pendingApprovals")} value={pendingCount} />
      </div>

      {/* Quick actions */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">{t("admin.quickActions")}</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <QuickCard
            icon={<UsersIcon className="w-8 h-8 text-blue-500" />}
            title={t("admin.manageUsers")}
            subtitle={t("admin.manageUsersHint")}
            to="/admin/users"
          />
          <QuickCard
            icon={<BookOpenIcon className="w-8 h-8 text-purple-500" />}
            title={t("admin.reviewTopics")}
            subtitle={t("admin.reviewTopicsHint")}
            to="/admin/topics"
          />
          <QuickCard
            icon={<TagIcon className="w-8 h-8 text-green-500" />}
            title={t("admin.manageTags")}
            subtitle={t("admin.manageTagsHint")}
            to="/admin/tags"
          />
        </div>
      </div>
    </div>
  );
}
