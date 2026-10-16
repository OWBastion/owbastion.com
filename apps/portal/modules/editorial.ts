import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineNuxtModule } from "@nuxt/kit";
import { createMarkdownParser } from "@nuxtjs/mdc/runtime";
import { rehypeHighlight } from "@nuxtjs/mdc/runtime/highlighter/rehype";
import { createShikiHighlighter } from "@nuxtjs/mdc/runtime/highlighter/shiki";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { bundledLanguages } from "shiki/langs";
import { bundledThemes } from "shiki/themes";
import { z } from "zod";
import { blogFrontmatterSchema, changelogFrontmatterSchema } from "../content/editorial-schemas";

const kinds = {
  blog: { schema: blogFrontmatterSchema, sortField: "publishedAt" },
  changelog: { schema: changelogFrontmatterSchema, sortField: "releasedAt" },
} as const;

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

let parserPromise: ReturnType<typeof createMarkdownParser> | undefined;
const getParser = () => (parserPromise ??= createMarkdownParser({
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
}));

function validateFrontmatter(schema: z.ZodType<EditorialMeta>, data: unknown, source: string): EditorialMeta {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`[editorial] ${source}: ${result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  }
  return result.data;
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  }));
  return nested.flat().sort();
}

/**
 * Compiles the Git-managed Markdown collections into generated JSON at
 * `.nuxt/editorial/` during nuxi prepare/dev/build. The runtime loader only
 * reads these files, so the bundle ships article ASTs without the parser or
 * the raw Markdown.
 */
export default defineNuxtModule({
  meta: { name: "editorial-content" },
  async setup(_options, nuxt) {
    const sourceRoot = join(nuxt.options.srcDir, "content");
    const outputRoot = join(nuxt.options.buildDir, "editorial");

    const generate = async () => {
      const parse = await getParser();
      await rm(outputRoot, { recursive: true, force: true });
      for (const [kind, { schema, sortField }] of Object.entries(kinds)) {
        const files = await listMarkdownFiles(join(sourceRoot, kind));
        const entries = await Promise.all(files.map(async (file) => {
          const slug = file.slice(join(sourceRoot, kind).length + 1, -".md".length).replaceAll("\\", "/");
          const parsed = await parse(await readFile(file, "utf8"));
          const meta = validateFrontmatter(schema, parsed.data, file);
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
            slug,
          };
        }));
        entries.sort((a, b) => Number(new Date(b[sortField] ?? 0)) - Number(new Date(a[sortField] ?? 0)));

        for (const { slug, ...entry } of entries) {
          const target = join(outputRoot, kind, `${slug}.json`);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, JSON.stringify(entry), "utf8");
        }
        const summaries = entries.map(({ body: _body, slug: _slug, ...entry }) => entry);
        await mkdir(outputRoot, { recursive: true });
        await writeFile(join(outputRoot, `index.${kind}.json`), JSON.stringify(summaries), "utf8");
      }
    };

    // Setup runs before .nuxt is (re)written; generate after templates land so
    // nuxi prepare, nuxt dev, and nuxt build all see the compiled data.
    nuxt.hooks.hook("app:templatesGenerated", () => generate());
    nuxt.hooks.hook("builder:watch", async (_event: string, path: string) => {
      const normalized = path.replaceAll("\\", "/");
      if (normalized.endsWith(".md") && normalized.includes("/content/")) await generate();
    });
  },
});
