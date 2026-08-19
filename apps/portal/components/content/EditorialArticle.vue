<script setup lang="ts">
import { computed } from "vue";
import { formatEditorialDate } from "~/utils/editorial";

type EditorialEntry = {
  title: string;
  description: string;
  path: string;
  body?: unknown;
  publishedAt?: string | Date;
  releasedAt?: string | Date;
  version?: string;
};

const props = defineProps<{
  entry: EditorialEntry;
  kind: "blog" | "changelog";
}>();

const dateValue = computed(() => props.kind === "blog" ? props.entry.publishedAt : props.entry.releasedAt);
const date = computed(() => dateValue.value ? formatEditorialDate(dateValue.value) : "");
const isChangelog = computed(() => props.kind === "changelog");
</script>

<template>
  <article class="editorial-article surface-card" :class="{ 'editorial-article--changelog': isChangelog }">
    <header class="editorial-article-header">
      <template v-if="isChangelog">
        <div class="changelog-masthead">
          <p class="changelog-version">
            <span class="sr-only">版本 </span>{{ entry.version }}
          </p>
          <time v-if="date" class="type-caption changelog-date" :datetime="String(dateValue)">{{ date }}</time>
        </div>
        <h1 class="type-headline changelog-title">{{ entry.title }}</h1>
      </template>
      <template v-else>
        <h1 class="page-title">{{ entry.title }}</h1>
        <div class="editorial-article-meta">
          <span class="editorial-kind">开发日志</span>
          <time v-if="date" :datetime="String(dateValue)">{{ date }}</time>
        </div>
        <p class="editorial-article-description">{{ entry.description }}</p>
      </template>
    </header>

    <div class="editorial-article-body">
      <ContentRenderer :value="entry" />
    </div>
  </article>
</template>

<style scoped>
.editorial-article { padding: clamp(24px, 5vw, 56px); }
.editorial-article-header { display: grid; gap: 1.125rem; padding-bottom: clamp(28px, 5vw, 48px); border-bottom: 1px solid var(--line); }
.editorial-article-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem 1rem; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
.editorial-kind { color: var(--accent); }
.editorial-article-description { max-width: 62ch; margin: 0; color: var(--muted); font-size: 1.06rem; line-height: 1.7; }
.editorial-article-body { max-width: 68ch; padding-top: clamp(28px, 5vw, 48px); color: var(--text); font-size: 1rem; line-height: 1.8; overflow-wrap: anywhere; }
.editorial-article-body :deep(:where(h2, h3, h4)) { margin: 2.2em 0 .7em; color: var(--text); line-height: 1.2; scroll-margin-top: calc(var(--sticky-chrome-top) + 0.75rem); }
.editorial-article-body :deep(:where(h2:first-child, h3:first-child, h4:first-child)) { margin-top: 0; }
.editorial-article-body :deep(p) { margin: 0 0 1.2em; }
.editorial-article-body :deep(ul), .editorial-article-body :deep(ol) { margin: 0 0 1.2em; padding-inline-start: 1.4em; }
.editorial-article-body :deep(li) { margin: 0 0 .4em; }
.editorial-article-body :deep(a) { color: var(--info); text-decoration: underline; text-decoration-thickness: .08em; text-underline-offset: .16em; }
.editorial-article-body :deep(a:hover) { color: color-mix(in oklch, var(--info) 80%, var(--text)); }
/* MDC wraps heading text in an anchor link; headings keep their own color and
   weight instead of looking like underlined links. */
.editorial-article-body :deep(:where(h2, h3, h4) a) { color: inherit; text-decoration: none; }
.editorial-article-body :deep(blockquote) { margin: 0 0 1.2em; padding: .2em 0 .2em 1.1rem; border-left: 2px solid var(--line-strong); color: var(--muted); }
.editorial-article-body :deep(blockquote p:last-child) { margin-bottom: 0; }
.editorial-article-body :deep(table) { width: 100%; margin: 0 0 1.2em; border-collapse: collapse; font-size: .92em; }
.editorial-article-body :deep(th), .editorial-article-body :deep(td) { padding: .5rem .75rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
.editorial-article-body :deep(th) { background: var(--surface-raised); font-weight: 650; }
.editorial-article-body :deep(hr) { margin: 2.4em 0; border: 0; border-top: 1px solid var(--line); }
.editorial-article-body :deep(img) { max-width: 100%; height: auto; border-radius: 10px; }
.editorial-article-body :deep(strong) { font-weight: 700; }
.editorial-article-body :deep(em) { font-style: italic; }
.editorial-article-body :deep(code) { padding: .12em .35em; border-radius: 5px; background: var(--surface-raised); font-size: .9em; }
.editorial-article-body :deep(pre) { max-width: 100%; overflow-x: auto; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-raised); }
.editorial-article-body :deep(pre code) { padding: 0; background: transparent; }

.changelog-masthead { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem 0.85rem; }
.changelog-version {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.25rem 0.8rem;
  border: 1px solid color-mix(in oklch, var(--accent) 42%, var(--line));
  border-radius: 999px;
  background: var(--accent-surface);
  color: var(--accent);
  font-size: var(--type-caption-size);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  line-height: 1;
}
.changelog-date { margin: 0; }
.changelog-title { overflow-wrap: anywhere; }

.editorial-article--changelog { padding: clamp(1.25rem, 4vw, 2.75rem); }
.editorial-article--changelog .editorial-article-header { gap: 0.85rem; padding-bottom: 1.25rem; }
.editorial-article--changelog .editorial-article-body {
  max-width: 62ch;
  padding-top: 1.35rem;
  font-size: var(--type-body-size);
  line-height: 1.75;
  overflow-wrap: break-word;
}
.editorial-article--changelog .editorial-article-body :deep(h2) {
  margin: 1.85rem 0 0.7rem;
  padding-top: 1.35rem;
  border-top: 1px solid var(--line);
  font-size: var(--type-headline-size);
  font-weight: 650;
  letter-spacing: var(--type-headline-tracking);
  line-height: var(--type-headline-leading);
}
.editorial-article--changelog .editorial-article-body :deep(h2:first-child) {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
.editorial-article--changelog .editorial-article-body :deep(h3) {
  margin: 1.35rem 0 0.45rem;
  font-size: var(--type-body-size);
  font-weight: 650;
  line-height: 1.35;
}
.editorial-article--changelog .editorial-article-body :deep(h4) {
  margin: 1.1rem 0 0.35rem;
  font-size: var(--type-body-size);
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.4;
}
.editorial-article--changelog .editorial-article-body :deep(h2 + h3),
.editorial-article--changelog .editorial-article-body :deep(h3 + h4) { margin-top: 0.85rem; }
.editorial-article--changelog .editorial-article-body :deep(p) { margin: 0 0 0.85rem; }
.editorial-article--changelog .editorial-article-body :deep(ul),
.editorial-article--changelog .editorial-article-body :deep(ol) {
  margin: 0 0 0.95rem;
  padding-inline-start: 1.15rem;
}
.editorial-article--changelog .editorial-article-body :deep(li) { margin: 0 0 0.5rem; line-height: 1.7; }
.editorial-article--changelog .editorial-article-body :deep(li:last-child) { margin-bottom: 0; }
.editorial-article--changelog .editorial-article-body :deep(li ul),
.editorial-article--changelog .editorial-article-body :deep(li ol) { margin: 0.4rem 0 0.15rem; }
.editorial-article--changelog .editorial-article-body :deep(li p) { margin: 0; }
.editorial-article--changelog .editorial-article-body :deep(blockquote) {
  margin: 0 0 0.95rem;
  padding: 0.15em 0 0.15em 0.9rem;
  color: var(--muted);
  font-size: 0.95em;
  line-height: 1.65;
}
.editorial-article--changelog .editorial-article-body :deep(hr) { margin: 1.75rem 0; }

@media (max-width: 620px) {
  .editorial-article { padding: 1.25rem 1rem; }
  .editorial-article-description { font-size: 1rem; }
  .editorial-article--changelog { padding: 1.15rem 1rem 1.35rem; }
}
@media (prefers-contrast: more) {
  .editorial-article { border-color: var(--text); }
  .changelog-version { border-color: var(--accent); }
}
</style>
