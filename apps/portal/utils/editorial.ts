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

type ContentNode = string | { value?: unknown; children?: unknown } | unknown[];

// All visible text of a parsed Markdown body, for reading time. Handles both the MDC AST (`children`) and minimark (`value`) shapes.
export function editorialText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => (Array.isArray(item) ? editorialText(item.slice(2)) : editorialText(item))).join(" ");
  if (node && typeof node === "object") {
    const { value, children } = node as Exclude<ContentNode, string | unknown[]>;
    return [typeof value === "string" ? value : editorialText(value), editorialText(children)].join(" ");
  }
  return "";
}

// Chinese is read by character, everything else by word; about 400 characters or 220 words a minute.
export function readingMinutes(text: string): number {
  const characters = (text.match(/[㐀-鿿]/g) ?? []).length;
  const words = (text.replace(/[㐀-鿿]/g, " ").match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(characters / 400 + words / 220));
}

export type EditorialTocEntry = { id: string; text: string; depth: number };

// Flat list of the h2/h3 headings Nuxt Content collected for the page.
export function editorialToc(body: unknown): EditorialTocEntry[] {
  const links = ((body as { toc?: { links?: unknown[] } } | null)?.toc?.links ?? []) as Array<{ id: string; text: string; depth: number; children?: unknown[] }>;
  const flat: EditorialTocEntry[] = [];
  const walk = (items: typeof links) => { for (const item of items) { if (item.depth <= 3) flat.push({ id: item.id, text: item.text, depth: item.depth }); if (item.children) walk(item.children as typeof links); } };
  walk(links);
  return flat;
}

// "8月1日", for rows already grouped under their year.
export function formatEditorialMonthDay(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

export const editorialYear = (value: string | Date) => new Date(value).getUTCFullYear();

// Every development log carries the 开发日志 tag; it says nothing next to the kind that is already shown.
export const editorialTags = (tags?: string[]) => (tags ?? []).filter((tag) => tag !== "开发日志");
