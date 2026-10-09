<script setup lang="ts">
import { computed } from "vue";
import { formatEditorialDate, type EditorialTocEntry } from "~/utils/editorial";

type EditorialEntry = {
  title: string;
  description: string;
  path: string;
  body?: unknown;
  tags?: string[];
  publishedAt?: string | Date;
  releasedAt?: string | Date;
  version?: string;
};

const props = withDefaults(defineProps<{
  entry: EditorialEntry;
  kind: "blog" | "changelog";
  toc?: EditorialTocEntry[];
  minutes?: number;
}>(), { toc: () => [], minutes: undefined });

const dateValue = computed(() => props.kind === "blog" ? props.entry.publishedAt : props.entry.releasedAt);
const date = computed(() => dateValue.value ? formatEditorialDate(dateValue.value) : "");
const isChangelog = computed(() => props.kind === "changelog");
// A contents list only helps once there is something to navigate.
const showToc = computed(() => props.toc.length >= 3);
</script>

<template>
  <div class="editorial-layout">
    <article class="editorial-article" :class="{ 'editorial-article--changelog': isChangelog }">
      <header class="editorial-article-header">
        <div class="editorial-kicker">
          <p v-if="isChangelog" class="changelog-version"><span class="sr-only">版本 </span>{{ entry.version }}</p>
          <span v-else class="editorial-kind">开发日志</span>
          <time v-if="date" class="editorial-date" :datetime="String(dateValue)">{{ date }}<ChangelogRelativeDay v-if="isChangelog && dateValue" :value="dateValue" /></time>
          <span v-if="minutes" class="editorial-minutes">约 {{ minutes }} 分钟读完</span>
        </div>
        <h1 :class="isChangelog ? 'type-headline changelog-title' : 'editorial-title'">{{ entry.title }}</h1>
        <p v-if="!isChangelog" class="editorial-article-description">{{ entry.description }}</p>
        <ul v-if="!isChangelog && entry.tags?.length" class="editorial-tags" aria-label="标签"><li v-for="tag in entry.tags" :key="tag">{{ tag }}</li></ul>
      </header>

      <details v-if="showToc" class="editorial-toc-inline">
        <summary>本文目录</summary>
        <EditorialToc :entries="toc" />
      </details>

      <div class="editorial-article-body">
        <ContentRenderer :value="entry" />
      </div>
    </article>
  </div>
</template>

<style scoped>
.editorial-layout { min-width: 0; }
.editorial-article { min-width: 0; }
.editorial-article-header { display: grid; gap: var(--space-4); padding-bottom: var(--space-8); }
.editorial-kicker { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.editorial-kind { color: var(--accent); font-weight: 600; }
.editorial-date { font-variant-numeric: tabular-nums; }
.editorial-minutes::before { content: "·"; margin-right: var(--space-3); }
.editorial-title { margin: 0; font-size: var(--type-title-size); font-weight: 700; letter-spacing: var(--type-title-tracking); line-height: 1.12; text-wrap: balance; overflow-wrap: anywhere; }
.editorial-article-description { margin: 0; color: var(--muted); font-size: 1.125rem; line-height: 1.7; }
.editorial-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.editorial-tags li { padding: 0 var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--muted); font-size: var(--type-caption-size); line-height: 1.9; }
.editorial-toc-inline { margin-bottom: var(--space-6); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.editorial-toc-inline summary { cursor: pointer; font-size: var(--type-label-sm-size); font-weight: 600; }
.editorial-toc-inline[open] summary { margin-bottom: var(--space-2); }
.editorial-toc-inline :deep(.editorial-toc__title) { display: none; }

.editorial-article-body { color: var(--text); font-size: var(--type-body-size); line-height: 1.85; overflow-wrap: anywhere; }
.editorial-article-body :deep(:where(h2, h3, h4)) { margin: 2.4em 0 .7em; color: var(--text); line-height: 1.3; scroll-margin-top: calc(var(--sticky-chrome-top) + 1rem); }
.editorial-article-body :deep(h2) { padding-top: 1.4em; border-top: 1px solid var(--line); font-size: 1.375rem; font-weight: 700; letter-spacing: -0.01em; }
.editorial-article-body :deep(h2:first-child) { margin-top: 0; padding-top: 0; border-top: 0; }
.editorial-article-body :deep(h3) { font-size: 1.125rem; font-weight: 600; }
.editorial-article-body :deep(h4) { font-size: 1rem; font-weight: 600; }
.editorial-article-body :deep(:where(h2:first-child, h3:first-child, h4:first-child)) { margin-top: 0; }
.editorial-article-body :deep(p) { margin: 0 0 1.25em; }
.editorial-article-body :deep(ul), .editorial-article-body :deep(ol) { margin: 0 0 1.25em; padding-inline-start: 1.4em; }
.editorial-article-body :deep(li) { margin: 0 0 .45em; }
.editorial-article-body :deep(a) { color: var(--info); text-decoration: underline; text-decoration-thickness: .08em; text-underline-offset: .16em; }
.editorial-article-body :deep(a:hover) { color: color-mix(in oklch, var(--info) 80%, var(--text)); }
/* MDC wraps heading text in an anchor link; headings keep their own color and weight instead of looking like underlined links. */
.editorial-article-body :deep(:where(h2, h3, h4) a) { color: inherit; text-decoration: none; }
/* A quoted opening line is the editor's note about the article, so it reads as a note, not as a quotation. */
.editorial-article-body :deep(blockquote) { margin: 0 0 1.5em; padding: var(--space-3) var(--space-4); border-left: 3px solid var(--accent); border-radius: 0 var(--radius-control) var(--radius-control) 0; background: var(--surface); color: var(--muted); font-size: .95em; line-height: 1.7; }
.editorial-article-body :deep(blockquote p:last-child) { margin-bottom: 0; }
.editorial-article-body :deep(table) { display: block; max-width: 100%; margin: 0 0 1.25em; overflow-x: auto; border-collapse: collapse; font-size: .92em; }
.editorial-article-body :deep(th), .editorial-article-body :deep(td) { padding: .5rem .75rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
.editorial-article-body :deep(th) { background: var(--surface-raised); font-weight: 600; }
.editorial-article-body :deep(hr) { margin: 2.4em 0; border: 0; border-top: 1px solid var(--line); }
.editorial-article-body :deep(img) { display: block; max-width: 100%; height: auto; margin: 1.5em auto; border-radius: var(--radius-control); }
.editorial-article-body :deep(strong) { font-weight: 700; }
.editorial-article-body :deep(em) { font-style: italic; }
.editorial-article-body :deep(code) { padding: .12em .35em; border-radius: var(--radius-control); background: var(--surface-raised); font-size: .9em; }
.editorial-article-body :deep(pre) { max-width: 100%; overflow-x: auto; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface-raised); }
.editorial-article-body :deep(pre code) { padding: 0; background: transparent; }
.editorial-article-body :deep(.katex-display) { max-width: 100%; overflow-x: auto; overflow-y: hidden; padding-block: .2rem; }

.changelog-version { display: inline-flex; align-items: center; min-height: 2rem; margin: 0; padding: var(--space-1) var(--space-3); border: 1px solid color-mix(in oklch, var(--accent) 42%, var(--line)); border-radius: var(--radius-pill); background: var(--accent-surface); color: var(--accent); font-size: var(--type-caption-size); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; line-height: 1; }
.changelog-title { margin: 0; overflow-wrap: anywhere; text-wrap: balance; }
.editorial-article--changelog .editorial-article-header { padding-bottom: var(--space-6); }
/* A release note is dense and scanned: tighter than an essay, but with the same section rhythm. */
.editorial-article--changelog .editorial-article-body { line-height: 1.75; }
.editorial-article--changelog .editorial-article-body :deep(h2) { font-size: var(--type-headline-size); font-weight: 600; letter-spacing: var(--type-headline-tracking); line-height: var(--type-headline-leading); }
.editorial-article--changelog .editorial-article-body :deep(h3) { margin: 1.5rem 0 .5rem; font-size: var(--type-body-size); font-weight: 600; }
.editorial-article--changelog .editorial-article-body :deep(h4) { margin: 1.1rem 0 .35rem; letter-spacing: 0; line-height: 1.4; }
.editorial-article--changelog .editorial-article-body :deep(p) { margin: 0 0 .85em; }
.editorial-article--changelog .editorial-article-body :deep(ul), .editorial-article--changelog .editorial-article-body :deep(ol) { margin: 0 0 1em; padding-inline-start: 1.15rem; }
.editorial-article--changelog .editorial-article-body :deep(li) { margin: 0 0 .5em; line-height: 1.7; }
.editorial-article--changelog .editorial-article-body :deep(li:last-child) { margin-bottom: 0; }
.editorial-article--changelog .editorial-article-body :deep(li ul), .editorial-article--changelog .editorial-article-body :deep(li ol) { margin: .4em 0 .15em; }
.editorial-article--changelog .editorial-article-body :deep(li p) { margin: 0; }

/* Container queries: the width is the page frame's, not the viewport's. */
@container (min-width: 62rem) { .editorial-toc-inline { display: none; } }
@container (max-width: 47.99rem) {
  .editorial-article-header { padding-bottom: var(--space-6); }
  .editorial-article-description { font-size: 1.0625rem; }
}
@media (prefers-contrast: more) {
  .changelog-version { border-color: var(--accent); }
  .editorial-article-body :deep(blockquote) { border-left-color: var(--text); }
}
</style>
