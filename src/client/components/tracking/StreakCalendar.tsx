import { useTranslation } from "react-i18next";

interface Props {
  data: Array<{ date: string; attempts: number }>;
  currentStreak: number;
  longestStreak: number;
  weeks?: number;
}

function intensityClass(attempts: number): string {
  if (attempts === 0) return "bg-gray-100 dark:bg-gray-800";
  if (attempts <= 3)  return "bg-green-200 dark:bg-green-900";
  if (attempts <= 9)  return "bg-green-400 dark:bg-green-700";
  return "bg-green-600 dark:bg-green-500";
}

export function StreakCalendar({ data, currentStreak, longestStreak, weeks = 12 }: Props) {
  const { t } = useTranslation();
  const totalDays = weeks * 7;

  const attemptMap = new Map<string, number>();
  for (const { date, attempts } of data) {
    attemptMap.set(date, attempts);
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (totalDays - 1));
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const todayStr = today.toISOString().slice(0, 10);

  type DayCell = { date: string; attempts: number; isToday: boolean; isFuture: boolean };
  const columns: DayCell[][] = [];

  const cursor = new Date(startDate);
  for (let w = 0; w < weeks; w++) {
    const col: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const ds = cursor.toISOString().slice(0, 10);
      col.push({
        date: ds,
        attempts: attemptMap.get(ds) ?? 0,
        isToday: ds === todayStr,
        isFuture: ds > todayStr,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    columns.push(col);
  }

  const monthNames = t("calendar.months", { returnObjects: true }) as string[];
  const dayLabels = t("calendar.days", { returnObjects: true }) as string[];

  const monthLabels: Array<{ label: string; colIndex: number }> = [];
  let lastMonth = -1;
  columns.forEach((col, i) => {
    const month = new Date(col[0]!.date + "T12:00:00Z").getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: monthNames[month]!, colIndex: i });
      lastMonth = month;
    }
  });

  return (
    <div className="select-none">
      {/* Month labels */}
      <div className="flex gap-[3px] mb-1 ml-6">
        {columns.map((_, i) => {
          const ml = monthLabels.find((m) => m.colIndex === i);
          return (
            <div key={i} className="w-[14px] flex-shrink-0">
              {ml ? (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">{ml.label}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex gap-[3px]">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-[3px] mr-1">
          {dayLabels.map((d, i) => (
            <div key={i} className="w-4 h-[14px] flex items-center justify-center">
              {i % 2 === 1 ? (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">{d}</span>
              ) : null}
            </div>
          ))}
        </div>

        {/* Columns */}
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${t("calendar.attempts", { count: cell.attempts })}`}
                className={[
                  "w-[14px] h-[14px] rounded-sm transition-colors",
                  cell.isFuture
                    ? "opacity-0"
                    : intensityClass(cell.attempts),
                  cell.isToday
                    ? "ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
                    : "",
                ].join(" ")}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>🔥 {t("calendar.streakDays", { count: currentStreak })}</span>
        <span className="text-gray-300 dark:text-gray-700">·</span>
        <span>{t("calendar.longest", { count: longestStreak })}</span>
        <div className="flex-1" />
        {/* Legend */}
        <div className="flex items-center gap-1">
          <span className="text-gray-400 dark:text-gray-500">{t("calendar.less")}</span>
          {[0, 2, 5, 10].map((n) => (
            <div
              key={n}
              className={`w-[12px] h-[12px] rounded-sm ${intensityClass(n)}`}
              title={n === 0 ? "0" : n === 2 ? "1–3" : n === 5 ? "4–9" : "10+"}
            />
          ))}
          <span className="text-gray-400 dark:text-gray-500">{t("calendar.more")}</span>
        </div>
      </div>
    </div>
  );
}
