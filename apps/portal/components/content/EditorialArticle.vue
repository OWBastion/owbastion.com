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

const date = computed(() => {
  const value = props.kind === "blog" ? props.entry.publishedAt : props.entry.releasedAt;
  return value ? formatEditorialDate(value) : "";
});
</script>

<template>
  <article class="editorial-article surface-card">
    <header class="editorial-article-header">
      <h1 class="page-title">{{ entry.title }}</h1>
      <div class="editorial-article-meta">
        <span class="editorial-kind">{{ kind === "blog" ? "开发日志" : `版本 ${entry.version}` }}</span>
        <time v-if="date" :datetime="String(kind === 'blog' ? entry.publishedAt : entry.releasedAt)">{{ date }}</time>
      </div>
      <p class="editorial-article-description">{{ entry.description }}</p>
    </header>

    <div class="editorial-article-body">
      <ContentRenderer :value="entry" />
    </div>
  </article>
</template>

<style scoped>
.editorial-article { padding: clamp(24px, 5vw, 56px); }
.editorial-article-header { display: grid; gap: 18px; padding-bottom: clamp(28px, 5vw, 48px); border-bottom: 1px solid var(--line); }
.editorial-article-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
.editorial-kind { color: var(--accent); }
.editorial-article-description { max-width: 62ch; margin: 0; color: var(--muted); font-size: 1.06rem; line-height: 1.7; }
.editorial-article-body { max-width: 68ch; padding-top: clamp(28px, 5vw, 48px); color: var(--text); font-size: 1rem; line-height: 1.8; overflow-wrap: anywhere; }
.editorial-article-body :deep(:where(h2, h3, h4)) { margin: 2.2em 0 .7em; color: var(--text); line-height: 1.2; }
.editorial-article-body :deep(:where(h2:first-child, h3:first-child, h4:first-child)) { margin-top: 0; }
.editorial-article-body :deep(p) { margin: 0 0 1.2em; }
.editorial-article-body :deep(ul), .editorial-article-body :deep(ol) { margin: 0 0 1.2em; padding-inline-start: 1.4em; }
.editorial-article-body :deep(a) { color: var(--info); text-decoration: underline; text-decoration-thickness: .08em; text-underline-offset: .16em; }
.editorial-article-body :deep(code) { padding: .12em .35em; border-radius: 5px; background: var(--surface-raised); font-size: .9em; }
.editorial-article-body :deep(pre) { max-width: 100%; overflow-x: auto; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-raised); }
.editorial-article-body :deep(pre code) { padding: 0; background: transparent; }
@media (max-width: 620px) { .editorial-article { padding: 20px 16px; }.editorial-article-description { font-size: 1rem; } }
@media (prefers-contrast: more) { .editorial-article { border-color: var(--text); } }
</style>
