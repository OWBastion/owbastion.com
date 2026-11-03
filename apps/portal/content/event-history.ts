import { eventLineage, ignoredEventHeadings, type EventLineageEntry } from "./event-lineage";

export interface AstNode { type: string; tag?: string; props?: Record<string, unknown>; children?: AstNode[]; value?: string }

export interface EventHistoryEntry {
  version: string;
  releasedAt: string;
  path: string;
  tag?: string;
  body: AstNode[];
}

interface Release { version: string; releasedAt: string; path: string }

const textOf = (node: AstNode): string => node.value ?? (node.children ?? []).map(textOf).join("");

const versionParts = (version: string) => version.split(".").map(Number);
const compareVersions = (left: string, right: string) => {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
};

/** "（重做）有我有你", "魔术大师（重做）", "新增：变形大师" → the event name plus its change tag. */
function parseHeading(raw: string): { name: string; tag?: string } {
  let name = raw.trim();
  let tag: string | undefined;
  const leading = name.match(/^（([^）]*)）\s*/);
  if (leading) { tag = leading[1]; name = name.slice(leading[0].length); }
  const trailing = name.match(/\s*（([^）]*)）$/);
  if (trailing) { tag = trailing[1]; name = name.slice(0, -trailing[0].length); }
  const prefix = name.match(/^(新增|新事件)：/);
  if (prefix) { tag = prefix[1] === "新事件" ? "新增" : prefix[1]; name = name.slice(prefix[0].length); }
  return { name, tag };
}

function findEntries(name: string, version: string): EventLineageEntry[] {
  const matches = eventLineage.filter((entry) => entry.names.some((candidate) =>
    typeof candidate === "string" ? candidate === name : candidate.name === name && (!candidate.until || compareVersions(version, candidate.until) <= 0)));
  const bounded = matches.filter((entry) => entry.names.some((candidate) => typeof candidate !== "string" && candidate.name === name));
  return matches.length > 1 && bounded.length === 1 ? bounded : matches;
}

/** The events a heading names. A heading naming two events ("A/B", "A → B") resolves each side. */
export function resolveEventHeading(raw: string, version: string): { entries: EventLineageEntry[]; tag?: string } {
  const { name, tag } = parseHeading(raw);
  const whole = findEntries(name, version);
  const found = whole.length ? whole : [...new Set(name.split(/\s*(?:→|\/)\s*/).flatMap((part) => findEntries(part, version)))];
  if (!found.length || (whole.length > 1)) {
    throw new Error(`[event-history] ${version}: heading "${raw}" matches ${found.length} events in content/event-lineage.ts`);
  }
  return { entries: found, tag };
}

/**
 * Finds the per-event balance sections of one release and, for events the platform
 * knows, wraps the heading text in the hover-card element. Sections under
 * 错误修复 are not event adjustments and are left alone.
 */
export function annotateEventSections(release: Release, children: AstNode[]) {
  const sections: Array<{ eventId: string; entry: EventHistoryEntry }> = [];
  let inEvents = false;
  let current: { entries: EventLineageEntry[]; entry: EventHistoryEntry } | null = null;
  const out = children.map((node) => {
    if (node.tag === "h2") { const title = textOf(node); inEvents = title.includes("随机事件") && !title.includes("修复"); current = null; return node; }
    if (!inEvents) return node;
    if (node.tag === "h3") { current = null; return node; }
    if (node.tag === "h4") {
      current = null;
      const heading = textOf(node);
      if (ignoredEventHeadings.includes(heading.trim())) return node;
      const { entries, tag } = resolveEventHeading(heading, release.version);
      const entry: EventHistoryEntry = { version: release.version, releasedAt: release.releasedAt, path: release.path, tag, body: [] };
      current = { entries, entry };
      for (const { eventId } of entries) if (eventId) sections.push({ eventId, entry });
      const linked = entries.length === 1 ? entries[0]!.eventId : undefined;
      return linked
        ? { ...node, children: [{ type: "element", tag: "event-name-hover", props: { eventId: linked }, children: node.children }] }
        : node;
    }
    current?.entry.body.push(node);
    return node;
  });
  return { children: out, sections };
}
