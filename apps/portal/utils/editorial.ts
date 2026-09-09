const MS_PER_DAY = 86_400_000;

export function formatEditorialDate(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatRelativeCalendarDay(
  value: string | Date,
  options: { now?: Date; timeZone?: string } = {},
): string {
  const released = new Date(value);
  const now = options.now ?? new Date();
  if (Number.isNaN(released.getTime()) || Number.isNaN(now.getTime())) return "";

  const diffDays = Math.round(
    (calendarDayMs(now, options.timeZone) - calendarDayMs(released, "UTC")) / MS_PER_DAY,
  );
  if (diffDays === 0) return "就在今天";
  if (diffDays > 0) return `${diffDays} 天前`;
  return `${-diffDays} 天后`;
}

function calendarDayMs(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return Date.UTC(year, month - 1, day);
}
