import { describe, expect, it } from "vitest";
import { buildRunDayGrid, runDayLevel, RUN_DAY_WEEKS } from "./run-days";

const DAY_MS = 86_400_000;
const shanghaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
const shanghaiWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short" });
const dayKey = (timestamp: number) => shanghaiDate.format(timestamp);
const weekdayIndex = (timestamp: number) => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[shanghaiWeekday.format(timestamp) as "Sun"];
const mondayIndex = (timestamp: number) => (weekdayIndex(timestamp) + 6) % 7;
const dayAt = (grid: ReturnType<typeof buildRunDayGrid>, date: string) => grid.weeks.flat().find((cell) => cell.date === date);

// 2026-10-07 11:30 UTC+8 (a Wednesday).
const nowMs = Date.UTC(2026, 9, 7, 3, 30);

describe("buildRunDayGrid", () => {
  it("lays out 53 Monday-first weeks ending at today on the UTC+8 calendar", () => {
    const grid = buildRunDayGrid([], nowMs);

    expect(grid.weeks).toHaveLength(RUN_DAY_WEEKS);
    for (const week of grid.weeks) expect(week).toHaveLength(7);

    const firstCell = grid.weeks[0]![0]!;
    expect(mondayIndex(Date.parse(`${firstCell.date}T00:00:00+08:00`))).toBe(0);

    const today = grid.weeks[52]![mondayIndex(nowMs)]!;
    expect(today.date).toBe(dayKey(nowMs));
    expect(today.future).toBe(false);
    const dayAfter = grid.weeks[52]![mondayIndex(nowMs) + 1];
    if (dayAfter) expect(dayAfter).toMatchObject({ future: true, runCount: 0 });

    const yesterday = grid.weeks[52]![mondayIndex(nowMs) - 1]!;
    expect(yesterday.date).toBe(dayKey(nowMs - DAY_MS));
  });

  it("places run counts on their UTC+8 day and totals them inside the window", () => {
    const grid = buildRunDayGrid(
      [
        { date: dayKey(nowMs), runCount: 3 },
        { date: dayKey(nowMs - 30 * DAY_MS), runCount: 1 },
        { date: dayKey(nowMs - 400 * DAY_MS), runCount: 9 },
      ],
      nowMs,
    );

    expect(dayAt(grid, dayKey(nowMs))).toMatchObject({ runCount: 3, level: 2 });
    expect(dayAt(grid, dayKey(nowMs - 30 * DAY_MS))).toMatchObject({ runCount: 1, level: 1 });
    expect(grid.totalRuns).toBe(4);
    expect(grid.activeDays).toBe(2);
  });

  it("labels the week containing each month's first day and always labels the first week", () => {
    const grid = buildRunDayGrid([], nowMs);
    const labels = new Map(grid.monthLabels.map((label) => [label.week, label.label]));

    expect(labels.has(0)).toBe(true);
    const firstOfOctober = grid.weeks.findIndex((week) => week.some((cell) => cell.date === "2026-10-01"));
    expect(labels.get(firstOfOctober)).toBe("10月");
    for (const label of grid.monthLabels) expect(label.label).toMatch(/^\d{1,2}月$/);
  });

  it("returns empty totals when there is no recorded day", () => {
    const grid = buildRunDayGrid([], nowMs);
    expect(grid.totalRuns).toBe(0);
    expect(grid.activeDays).toBe(0);
    expect(grid.weeks.flat().every((cell) => cell.runCount === 0)).toBe(true);
  });
});

describe("runDayLevel", () => {
  it("buckets counts into fixed intensity levels", () => {
    expect(runDayLevel(0)).toBe(0);
    expect(runDayLevel(1)).toBe(1);
    expect(runDayLevel(2)).toBe(1);
    expect(runDayLevel(3)).toBe(2);
    expect(runDayLevel(4)).toBe(2);
    expect(runDayLevel(5)).toBe(3);
    expect(runDayLevel(6)).toBe(3);
    expect(runDayLevel(7)).toBe(4);
    expect(runDayLevel(42)).toBe(4);
  });
});
