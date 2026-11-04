import { eventLineage, ignoredEventHeadings, type EventLineageEntry } from "./event-lineage";

export interface AstNode { type: string; tag?: string; props?: Record<string, unknown>; children?: AstNode[]; value?: string }

export interface EventHistoryEntry {
  version: string;
  releasedAt: string;
  path: string;
  tag?: string;
  /** The limited-time mode or activity this change applies to, when it is not the regular game. */
  scope?: string;
  /** The heading the event had in this release, when it differs from its current name. */
  formerName?: string;
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

const currentName = (entry: EventLineageEntry) => {
  const last = entry.names[entry.names.length - 1]!;
  return typeof last === "string" ? last : last.name;
};

const scopeNote = (node: AstNode | undefined) => node?.tag === "blockquote" ? textOf(node).match(/仅适用于「([^」]+)」/)?.[1] : undefined;

// A list item with blank lines around it wraps its text in a paragraph.
const itemNodes = (item: AstNode): AstNode[] => {
  const [first, ...rest] = item.children ?? [];
  return first?.tag === "p" ? [...(first.children ?? []), ...rest] : item.children ?? [];
};

/** "「A」「B」与「C」加入事件池" → [A, B, C]; "**A：** 说明" → [A]. Other list items name no event. */
function listItemNames(item: AstNode): string[] {
  const first = itemNodes(item)[0];
  if (first?.tag === "strong") {
    const label = textOf(first).trim();
    if (/[：:]$/.test(label)) return [label.slice(0, -1).trim()];
  }
  const lead = textOf(item).match(/^\s*(?:「[^」]+」\s*[与和、及]?\s*)+/)?.[0];
  return lead ? [...lead.matchAll(/「([^」]+)」/g)].map((match) => match[1]!) : [];
}

/** The nodes of a list item without its bold "名称：" label, as a one-item list. */
function itemBody(item: AstNode): AstNode[] {
  const nodes = itemNodes(item);
  const first = nodes[0];
  const labelled = first?.tag === "strong" && /[：:]$/.test(textOf(first).trim());
  const rest = labelled ? nodes.slice(1) : nodes;
  const [head, ...tail] = rest;
  const trimmed = head?.type === "text" ? [{ ...head, value: head.value!.replace(/^\s+/, "") }, ...tail] : rest;
  return [{ type: "element", tag: "ul", props: {}, children: [{ type: "element", tag: "li", props: {}, children: trimmed }] }];
}

/**
 * Finds the per-event balance changes of one release: `####` sections, and list items
 * that start with a bold "名称：" or quoted 「名称」. For events the platform knows, a
 * `####` heading gets the hover-card element. Sections under 错误修复 are left alone.
 */
export function annotateEventSections(release: Release, children: AstNode[]) {
  const sections: Array<{ eventId: string; entry: EventHistoryEntry }> = [];
  const base = { version: release.version, releasedAt: release.releasedAt, path: release.path };
  let inEvents = false;
  let eventsH2 = false;
  let announced = false;
  let returning = false;
  let h2Scope: string | undefined;
  let current: { entries: EventLineageEntry[]; entry: EventHistoryEntry } | null = null;
  let previous: AstNode | undefined;
  const record = (entries: EventLineageEntry[], entry: EventHistoryEntry) => {
    for (const { eventId } of entries) if (eventId) sections.push({ eventId, entry });
  };
  const out = children.map((node) => {
    const before = previous;
    previous = node;
    if (node.tag === "h2") {
      const title = textOf(node);
      eventsH2 = /随机事件|周年专属事件|事件回归/.test(title) && !title.includes("修复");
      inEvents = eventsH2;
      announced = title.includes("新增");
      returning = title.includes("事件回归");
      h2Scope = undefined; current = null;
      return node;
    }
    if (before?.tag === "h2") h2Scope = scopeNote(node);
    // An activity section (春节限时活动) holds its event changes under an h3 of its own.
    if (node.tag === "h3") inEvents = eventsH2 || (/随机事件调整/.test(textOf(node)) && !textOf(node).includes("修复"));
    if (!inEvents) return node;
    if (node.tag === "h3") {
      const title = textOf(node);
      current = null;
      // Under 事件回归 each h3 is one returning event.
      const entries = returning ? findEntries(parseHeading(title).name, release.version) : [];
      if (entries.length === 1) {
        const entry: EventHistoryEntry = { ...base, tag: "回归", scope: h2Scope, body: [] };
        current = { entries, entry };
        record(entries, entry);
      }
      return node;
    }
    if (node.tag === "h4") {
      current = null;
      const heading = textOf(node);
      if (ignoredEventHeadings.includes(heading.trim())) return node;
      const { entries, tag } = resolveEventHeading(heading, release.version);
      const name = parseHeading(heading).name;
      const former = entries.length === 1 && name !== currentName(entries[0]!) && entries[0]!.names.some((candidate) => (typeof candidate === "string" ? candidate : candidate.name) === name);
      const entry: EventHistoryEntry = { ...base, tag, scope: h2Scope, formerName: former ? name : undefined, body: [] };
      current = { entries, entry };
      record(entries, entry);
      const linked = entries.length === 1 ? entries[0]!.eventId : undefined;
      return linked
        ? { ...node, children: [{ type: "element", tag: "event-name-hover", props: { eventId: linked }, children: node.children }] }
        : node;
    }
    if (current) {
      current.entry.body.push(node);
    } else if (node.tag === "ul") {
      for (const item of node.children ?? []) {
        for (const name of listItemNames(item)) {
          const entries = findEntries(parseHeading(name).name, release.version);
          if (entries.length !== 1) continue;
          const entry: EventHistoryEntry = { ...base, tag: announced ? "新增" : undefined, scope: h2Scope, body: itemBody(item) };
          record(entries, entry);
        }
      }
    }
    return node;
  });
  return { children: out, sections };
}

/**
 * Oldest first in, newest first out. One release shows one entry per scope: changes of the same
 * event and scope in a release are merged, and a change identical to the one before it is a repeat and is dropped.
 */
export function dedupeEventHistory(entries: EventHistoryEntry[]): EventHistoryEntry[] {
  const kept: EventHistoryEntry[] = [];
  for (const entry of [...entries].sort((a, b) => compareVersions(a.version, b.version))) {
    const same = kept.find((candidate) => candidate.version === entry.version && candidate.scope === entry.scope);
    if (same) {
      same.tag ??= entry.tag;
      same.formerName ??= entry.formerName;
      same.body = [...same.body, ...entry.body];
      continue;
    }
    const last = kept[kept.length - 1];
    if (last && last.scope === entry.scope && JSON.stringify(last.body) === JSON.stringify(entry.body)) continue;
    kept.push({ ...entry });
  }
  return kept.reverse();
}
