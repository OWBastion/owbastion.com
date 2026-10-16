import type { MDCParserResult, MDCRoot, Toc } from "@nuxtjs/mdc";
import { z } from "zod";
import { blogFrontmatterSchema, changelogFrontmatterSchema } from "../content/editorial-schemas";

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

const collections = {
  blog: { schema: blogFrontmatterSchema, sortField: "publishedAt" },
  changelog: { schema: changelogFrontmatterSchema, sortField: "releasedAt" },
} as const;

// Vite resolves this statically; each Markdown file becomes a lazily-loaded raw string.
const markdownSources = import.meta.glob("../content/**/*.md", { query: "?raw", import: "default" });

const parseOptions = async () => {
  const [{ parseMarkdown }, { rehypeHighlight }, { createShikiHighlighter }, { default: remarkMath }, { default: rehypeKatex }, { bundledLanguages }, { bundledThemes }] = await Promise.all([
    import("@nuxtjs/mdc/runtime"),
    import("@nuxtjs/mdc/runtime/highlighter/rehype"),
    import("@nuxtjs/mdc/runtime/highlighter/shiki"),
    import("remark-math"),
    import("rehype-katex"),
    import("shiki/langs"),
    import("shiki/themes"),
  ]);
  return {
    remark: { plugins: { "remark-math": { instance: remarkMath } } },
    rehype: {
      plugins: {
        "rehype-katex": { instance: rehypeKatex },
        // Matches the highlight setup @nuxt/content applied by default (Shiki, material-theme-palenight).
        highlight: {
          instance: rehypeHighlight,
          options: {
            highlighter: createShikiHighlighter({ bundledLangs: bundledLanguages, bundledThemes }),
            theme: { default: "material-theme-palenight" },
          },
        },
      },
    },
  } satisfies Parameters<typeof parseMarkdown>[1];
};

let parserPromise: ReturnType<typeof buildParser> | undefined;
async function buildParser() {
  const { createMarkdownParser } = await import("@nuxtjs/mdc/runtime");
  return createMarkdownParser(await parseOptions());
}

const collectionCache = new Map<EditorialKind, Promise<EditorialEntry[]>>();

function loadCollection(kind: EditorialKind): Promise<EditorialEntry[]> {
  let pending = collectionCache.get(kind);
  if (!pending) {
    pending = buildCollection(kind);
    collectionCache.set(kind, pending);
  }
  return pending;
}

async function buildCollection(kind: EditorialKind): Promise<EditorialEntry[]> {
  const { schema, sortField } = collections[kind];
  const parser = await (parserPromise ||= buildParser());
  const prefix = `../content/${kind}/`;

  const entries = await Promise.all(Object.entries(markdownSources)
    .filter(([source]) => source.startsWith(prefix))
    .map(async ([source, load]) => {
      const slug = source.slice(prefix.length, -".md".length);
      const parsed: MDCParserResult = await parser((await load()) as string);
      const meta = validateFrontmatter(schema, parsed.data, source);
      return {
        path: `/${kind}/${slug}`,
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        publishedAt: meta.publishedAt?.toISOString(),
        releasedAt: meta.releasedAt?.toISOString(),
        updatedAt: meta.updatedAt?.toISOString(),
        version: meta.version,
        cover: meta.cover,
        body: { ...parsed.body, toc: parsed.toc },
      } satisfies EditorialEntry;
    }));

  return entries.sort((a, b) => Number(new Date(b[sortField] ?? 0)) - Number(new Date(a[sortField] ?? 0)));
}

type EditorialMeta = {
  title: string;
  description: string;
  tags: string[];
  publishedAt?: Date;
  releasedAt?: Date;
  updatedAt?: Date;
  version?: string;
  cover?: { src: string; alt: string };
};

function validateFrontmatter(schema: z.ZodType<EditorialMeta>, data: unknown, source: string): EditorialMeta {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`[editorial] ${source}: ${result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  }
  return result.data;
}

/** Full entries including the rendered body AST, newest first. */
export const queryEditorialEntries = (kind: EditorialKind) => loadCollection(kind);

/** Metadata-only projection for list pages and neighbour navigation. */
export function queryEditorialSummaries(kind: "blog"): Promise<BlogSummary[]>;
export function queryEditorialSummaries(kind: "changelog"): Promise<ChangelogSummary[]>;
export async function queryEditorialSummaries(kind: EditorialKind): Promise<EditorialSummary[]> {
  return (await loadCollection(kind)).map(({ body: _body, ...entry }) => entry);
}

/** One entry by collection path, or null when the slug does not exist. */
export const findEditorialEntry = async (kind: EditorialKind, slug: string): Promise<EditorialEntry | null> =>
  (await loadCollection(kind)).find((entry) => entry.path === `/${kind}/${slug}`) ?? null;
