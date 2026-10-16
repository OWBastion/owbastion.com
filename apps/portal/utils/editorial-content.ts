import type { MDCRoot, Toc } from "@nuxtjs/mdc";

export type EditorialKind = "blog" | "changelog";

export type EditorialBody = MDCRoot & { toc?: Toc };

export interface EditorialEntry {
  path: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt?: string;
  releasedAt?: string;
  updatedAt?: string;
  version?: string;
  cover?: { src: string; alt: string };
  body: EditorialBody;
}

export type EditorialSummary = Omit<EditorialEntry, "body">;
type EditorialBase = Omit<EditorialEntry, "body" | "publishedAt" | "releasedAt" | "version">;
export interface BlogSummary extends EditorialBase { publishedAt: string }
export interface ChangelogSummary extends EditorialBase { releasedAt: string; version: string }

// The editorial Nuxt module compiles the Markdown collections into these JSON
// files during nuxi prepare/dev/build; the runtime only reads generated data.
const summaryModules = import.meta.glob("../.generated/editorial/index.*.json", { import: "default" });
const entryModules = import.meta.glob("../.generated/editorial/*/*.json", { import: "default" });

const sortField = { blog: "publishedAt", changelog: "releasedAt" } as const;

// A missing index file means generation never ran — fail loudly instead of
// silently serving empty lists or 404s from stale/absent data.
function ensureGenerated(kind: EditorialKind): void {
  if (!summaryModules[`../.generated/editorial/index.${kind}.json`]) {
    throw new Error(`[editorial] generated data missing for "${kind}" — run \`nuxi prepare\` (or a build) first`);
  }
}

async function loadSummaries(kind: EditorialKind): Promise<EditorialSummary[]> {
  ensureGenerated(kind);
  return (await summaryModules[`../.generated/editorial/index.${kind}.json`]!()) as EditorialSummary[];
}

/** Full entries including the rendered body AST, newest first. */
export async function queryEditorialEntries(kind: EditorialKind): Promise<EditorialEntry[]> {
  ensureGenerated(kind);
  const prefix = `../.generated/editorial/${kind}/`;
  const loads = Object.entries(entryModules)
    .filter(([source]) => source.startsWith(prefix))
    .map(([, load]) => load());
  const entries = await Promise.all(loads) as EditorialEntry[];
  const field = sortField[kind];
  return entries.sort((a, b) => Number(new Date(b[field] ?? 0)) - Number(new Date(a[field] ?? 0)));
}

/** Metadata-only projection for list pages and neighbour navigation. */
export function queryEditorialSummaries(kind: "blog"): Promise<BlogSummary[]>;
export function queryEditorialSummaries(kind: "changelog"): Promise<ChangelogSummary[]>;
export function queryEditorialSummaries(kind: EditorialKind): Promise<EditorialSummary[]> {
  return loadSummaries(kind);
}

/** One entry by collection path, or null when the slug does not exist. */
export async function findEditorialEntry(kind: EditorialKind, slug: string): Promise<EditorialEntry | null> {
  ensureGenerated(kind);
  const load = entryModules[`../.generated/editorial/${kind}/${slug}.json`];
  return load ? ((await load()) as EditorialEntry) : null;
}
