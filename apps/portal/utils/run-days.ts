export type RunDayCount = { date: string; runCount: number };

export type RunDayCell = { date: string; runCount: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

export type RunDayGrid = {
  weeks: RunDayCell[][];
  monthLabels: Array<{ week: number; label: string }>;
  totalRuns: number;
  activeDays: number;
};

const DAY_MS = 86_400_000;
const UTC8_MS = 8 * 3_600_000;
export const RUN_DAY_WEEKS = 53;

const utc8DayIndex = (timestamp: number) => Math.floor((timestamp + UTC8_MS) / DAY_MS);
// The UTC+8 calendar date for a day index: the index counts UTC+8 days, so
// index * DAY_MS is 08:00 UTC on that date and toISOString names it directly.
const utc8DayLabel = (index: number) => new Date(index * DAY_MS).toISOString().slice(0, 10);

export const runDayLevel = (runCount: number): RunDayCell["level"] =>
  (runCount <= 0 ? 0 : Math.min(4, Math.ceil(runCount / 2))) as RunDayCell["level"];

// Builds a Monday-first, 53-week heatmap ending today on the UTC+8 calendar so
// each cell matches the player-facing day the API reports.
export function buildRunDayGrid(days: RunDayCount[], nowMs: number): RunDayGrid {
  const counts = new Map(days.map((day) => [day.date, day.runCount]));
  const todayIndex = utc8DayIndex(nowMs);
  const todayWeekday = (new Date(nowMs + UTC8_MS).getUTCDay() + 6) % 7;
  const firstWeekStart = todayIndex - todayWeekday - (RUN_DAY_WEEKS - 1) * 7;

  const weeks: RunDayCell[][] = [];
  const monthLabels: RunDayGrid["monthLabels"] = [];
  let totalRuns = 0;
  let activeDays = 0;

  for (let week = 0; week < RUN_DAY_WEEKS; week += 1) {
    const column: RunDayCell[] = [];
    let labelMonth: number | null = null;
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const dayIndex = firstWeekStart + week * 7 + weekday;
      const date = utc8DayLabel(dayIndex);
      const future = dayIndex > todayIndex;
      const runCount = future ? 0 : (counts.get(date) ?? 0);
      if (labelMonth === null && date.endsWith("-01")) labelMonth = Number(date.slice(5, 7));
      column.push({ date, runCount, level: runDayLevel(runCount), future });
      if (!future) {
        totalRuns += runCount;
        if (runCount > 0) activeDays += 1;
      }
    }
    weeks.push(column);
    if (labelMonth === null && week === 0) labelMonth = Number(column[0]!.date.slice(5, 7));
    if (labelMonth !== null) monthLabels.push({ week, label: `${labelMonth}月` });
  }

  return { weeks, monthLabels, totalRuns, activeDays };
}
