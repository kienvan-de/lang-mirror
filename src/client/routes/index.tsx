import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api } from "../lib/api";
import { langFlag, langLabel, langName } from "../lib/lang";
import { StreakCalendar } from "../components/tracking/StreakCalendar";

function timeAgo(isoStr: string, t: TFunction): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1)   return t("dashboard.justNow");
  if (minutes < 60)  return t("dashboard.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return t("dashboard.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return t("dashboard.daysAgo", { n: days });
}

export function DashboardPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: daily, isLoading: dailyLoading } = useQuery({
    queryKey: ["stats", "daily"],
    queryFn: api.getDailyStats,
    refetchInterval: 30_000,
  });

  const { data: streak, isLoading: streakLoading } = useQuery({
    queryKey: ["stats", "streak"],
    queryFn: api.getStreak,
    refetchInterval: 60_000,
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["stats", "recent"],
    queryFn: api.getRecentPractice,
    refetchInterval: 30_000,
  });

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: ["stats", "calendar"],
    queryFn: () => api.getCalendar(12),
    refetchInterval: 60_000,
  });

  const isLoading = dailyLoading || streakLoading || recentLoading || calendarLoading;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("dashboard.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t("dashboard.subtitle")}</p>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Today's attempts */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{t("dashboard.today")}</div>
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-28 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {daily?.today.attempts ?? 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t("dashboard.attempts", { count: daily?.today.attempts ?? 0 })}
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                {t("dashboard.sentences", { count: daily?.today.sentences ?? 0 })} ·{" "}
                {t("dashboard.topics", { count: daily?.today.topics ?? 0 })}
              </div>
            </>
          )}
        </div>

        {/* Streak */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{t("dashboard.streak")}</div>
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ) : (
            <>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {(streak?.currentStreak ?? 0) > 0 && <span>🔥</span>}
                {streak?.currentStreak ?? 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t("dashboard.days", { count: streak?.currentStreak ?? 0 })} {t("dashboard.inARow")}
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                {t("dashboard.longest")} {t("dashboard.days", { count: streak?.longestStreak ?? 0 })}
              </div>
            </>
          )}
        </div>

        {/* This week */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{t("dashboard.thisWeek")}</div>
          {isLoading ? (
            <div className="space-y-1 animate-pulse">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-2 bg-gray-100 dark:bg-gray-800 rounded" />
              ))}
            </div>
          ) : (
            <WeekBarChart week={daily?.week ?? []} />
          )}
        </div>
      </div>

      {/* Recent topics */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t("dashboard.recentPractice")}</h2>
          <Link to="/path" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {t("dashboard.viewPath")} →
          </Link>
        </div>

        {recentLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-300 dark:border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : (recent ?? []).length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
            <div className="text-4xl mb-3">🪞</div>
            <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">{t("dashboard.noPracticeYet")}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">{t("dashboard.noPracticeSubtitle")}</p>
            <Link
              to="/topics"
              className="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
            >
              {t("dashboard.goToTopics")}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {(recent ?? []).map((item) => {
              const pct = item.totalSentences > 0
                ? Math.round((item.sentencesAttemptedToday / item.totalSentences) * 100)
                : 0;
              return (
                <div
                  key={`${item.topicId}-${item.versionId}`}
                  className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-300 dark:border-gray-800 px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Lang badge */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex flex-col items-center justify-center border border-blue-200 dark:border-blue-800">
                    <span className="text-xl leading-none">{langFlag(item.langCode)}</span>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">{langLabel(item.langCode)}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.topicTitle}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {langName(item.langCode)} · {timeAgo(item.lastAttemptAt, t)}
                    </p>
                    {/* Today's progress */}
                    {item.totalSentences > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct === 100
                                ? "bg-green-500"
                                : pct > 0
                                  ? "bg-blue-500"
                                  : "bg-gray-200 dark:bg-gray-700"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {t("dashboard.todayCount", { count: item.sentencesAttemptedToday })}/{item.totalSentences}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Continue button */}
                  <Link
                    to="/practice/$topicId/$langCode"
                    params={{ topicId: item.topicId, langCode: item.langCode }}
                    onClick={() => {
                      qc.invalidateQueries({ queryKey: ["stats"] });
                    }}
                    className="flex-shrink-0 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-xs font-semibold text-white transition-colors shadow-sm"
                  >
                    {t("dashboard.continue")} ▶
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar heatmap */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-300 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5">{t("dashboard.practiceHistory")}</h2>
        {calendarLoading || streakLoading ? (
          <div className="h-32 animate-pulse bg-gray-50 dark:bg-gray-800 rounded-xl" />
        ) : (
          <div className="overflow-x-auto">
            <StreakCalendar
              data={calendar ?? []}
              currentStreak={streak?.currentStreak ?? 0}
              longestStreak={streak?.longestStreak ?? 0}
              weeks={12}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini bar chart for the week ───────────────────────────────────────────────

function WeekBarChart({ week }: { week: Array<{ date: string; attempts: number }> }) {
  const { t } = useTranslation();

  if (week.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-600">{t("dashboard.noPracticeThisWeek")}</p>
    );
  }

  const max = Math.max(...week.map((d) => d.attempts), 1);

  // Build last 7 days
  const days: Array<{ date: string; attempts: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const ds = d.toISOString().slice(0, 10);
    days.push({ date: ds, attempts: week.find((w) => w.date === ds)?.attempts ?? 0 });
  }

  const dayNames = t("dashboard.days_short", { returnObjects: true }) as string[];

  return (
    <div className="flex items-end gap-1.5 h-16">
      {days.map(({ date, attempts }) => {
        const pct = Math.max(4, (attempts / max) * 100);
        const dow = new Date(date + "T12:00:00Z").getUTCDay();
        const isToday = date === new Date().toISOString().slice(0, 10);
        return (
          <div key={date} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm transition-all ${
                isToday
                  ? attempts > 0 ? "bg-blue-500" : "bg-blue-200 dark:bg-blue-900/40"
                  : attempts > 0 ? "bg-gray-400 dark:bg-gray-500" : "bg-gray-100 dark:bg-gray-800"
              }`}
              style={{ height: `${pct}%` }}
              title={`${date}: ${attempts}`}
            />
            <span className="text-[9px] text-gray-400 dark:text-gray-500">{dayNames[dow]}</span>
          </div>
        );
      })}
    </div>
  );
}
