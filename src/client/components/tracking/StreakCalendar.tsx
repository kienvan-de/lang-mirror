import { useTranslation } from "react-i18next";
import { useRef, useState, useEffect, useMemo } from "react";

interface Props {
  data: Array<{ date: string; attempts: number }>;
  currentStreak: number;
  longestStreak: number;
}

const CELL_SIZE = 14;
const GAP = 3;
const COL_WIDTH = CELL_SIZE + GAP; // 17px per week column
const LABEL_COL_WIDTH = 20; // day-of-week labels

function intensityClass(attempts: number): string {
  if (attempts === 0) return "bg-gray-100 dark:bg-gray-800";
  if (attempts <= 3)  return "bg-green-200 dark:bg-green-900";
  if (attempts <= 9)  return "bg-green-400 dark:bg-green-700";
  return "bg-green-600 dark:bg-green-500";
}

type DayCell = { date: string; attempts: number; isToday: boolean; isFuture: boolean; isOutside: boolean };

export function StreakCalendar({ data, currentStreak, longestStreak }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Build full-year grid (Jan 1 → Dec 31, padded to full weeks) ──

  const { columns, todayStr } = useMemo(() => {
    const attemptMap = new Map<string, number>();
    for (const { date, attempts } of data) {
      attemptMap.set(date, attempts);
    }

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const year = today.getFullYear();

    // Jan 1 aligned to its week's Sunday
    const jan1 = new Date(year, 0, 1, 12, 0, 0, 0);
    const startDate = new Date(jan1);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // Dec 31 aligned to its week's Saturday
    const dec31 = new Date(year, 11, 31, 12, 0, 0, 0);
    const endDate = new Date(dec31);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);

    const columns: DayCell[][] = [];
    const cursor = new Date(startDate);
    for (let w = 0; w < totalWeeks; w++) {
      const col: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const ds = cursor.toISOString().slice(0, 10);
        col.push({
          date: ds,
          attempts: attemptMap.get(ds) ?? 0,
          isToday: ds === todayStr,
          isFuture: ds > todayStr,
          isOutside: cursor.getFullYear() !== year,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      columns.push(col);
    }

    return { columns, todayStr };
  }, [data]);

  const totalWeeks = columns.length;

  // ── Responsive: show all weeks on desktop, recent weeks on mobile ──

  const [visibleStart, setVisibleStart] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const available = el.clientWidth - LABEL_COL_WIDTH;
      const fitsAll = Math.floor(available / COL_WIDTH) >= totalWeeks;
      if (fitsAll) {
        setVisibleStart(0);
      } else {
        // Show as many recent weeks as fit, but at least 8
        const maxWeeks = Math.max(8, Math.floor(available / COL_WIDTH));
        setVisibleStart(Math.max(0, totalWeeks - maxWeeks));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [totalWeeks]);

  // ── Derived data for rendering ──

  const visibleColumns = columns.slice(visibleStart);

  const monthNames = t("calendar.months", { returnObjects: true }) as string[];
  const dayLabels = t("calendar.days", { returnObjects: true }) as string[];

  const monthLabels: Array<{ label: string; colIndex: number }> = [];
  let lastMonth = -1;
  visibleColumns.forEach((col, i) => {
    const month = new Date(col[0]!.date + "T12:00:00Z").getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: monthNames[month]!, colIndex: i });
      lastMonth = month;
    }
  });

  return (
    <div ref={containerRef} className="select-none w-full">
      {/* Month labels */}
      <div className="relative h-4 mb-1" style={{ marginLeft: LABEL_COL_WIDTH }}>
        {monthLabels.map((ml, i) => {
          const nextCol = monthLabels[i + 1]?.colIndex ?? visibleColumns.length;
          const spanCols = nextCol - ml.colIndex;
          if (spanCols < 3) return null;
          return (
            <span
              key={`${ml.label}-${ml.colIndex}`}
              className="absolute text-[10px] text-gray-400 dark:text-gray-500 leading-none truncate"
              style={{
                left: ml.colIndex * COL_WIDTH,
                width: spanCols * COL_WIDTH - GAP,
              }}
            >
              {ml.label}
            </span>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex" style={{ gap: GAP }}>
        {/* Day-of-week labels */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: GAP, width: LABEL_COL_WIDTH - GAP }}>
          {dayLabels.map((d, i) => (
            <div key={i} className="flex items-center justify-end" style={{ height: CELL_SIZE }}>
              {i % 2 === 1 ? (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">{d}</span>
              ) : null}
            </div>
          ))}
        </div>

        {/* Week columns */}
        {visibleColumns.map((col, ci) => (
          <div key={ci} className="flex flex-col" style={{ gap: GAP }}>
            {col.map((cell) => (
              <div
                key={cell.date}
                title={cell.isOutside || cell.isFuture ? undefined : `${cell.date}: ${t("calendar.attempts", { count: cell.attempts })}`}
                className={[
                  "rounded-sm transition-colors",
                  cell.isOutside || cell.isFuture
                    ? "opacity-0"
                    : intensityClass(cell.attempts),
                  cell.isToday
                    ? "ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
                    : "",
                ].join(" ")}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
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
              className={`rounded-sm ${intensityClass(n)}`}
              style={{ width: 12, height: 12 }}
              title={n === 0 ? "0" : n === 2 ? "1–3" : n === 5 ? "4–9" : "10+"}
            />
          ))}
          <span className="text-gray-400 dark:text-gray-500">{t("calendar.more")}</span>
        </div>
      </div>
    </div>
  );
}
