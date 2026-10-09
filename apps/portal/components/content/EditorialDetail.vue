<script setup lang="ts">
import type { EditorialTocEntry } from "~/utils/editorial";
import type { EditorialNeighbor } from "./EditorialNeighbors.vue";

type EditorialEntry = { title: string; description: string; path: string; body?: unknown; tags?: string[]; publishedAt?: string | Date; releasedAt?: string | Date; version?: string };

const props = defineProps<{
  kind: "blog" | "changelog";
  entry: EditorialEntry | null;
  status: string;
  failed: boolean;
  canonical: string;
  shareTitle: string;
  toc: EditorialTocEntry[];
  minutes?: number;
  older: EditorialNeighbor | null;
  newer: EditorialNeighbor | null;
}>();

const labels = computed(() => props.kind === "blog" ? { list: "/blog", back: "返回开发日志", read: "无法读取开发日志", missing: "找不到这篇开发日志" } : { list: "/changelog", back: "返回版本更新", read: "无法读取版本更新", missing: "找不到这条版本更新" });
</script>

<template>
  <main class="editorial-detail-page page-shell--readable">
   <div class="editorial-frame" :class="{ 'has-toc': toc.length >= 3 && entry }">
    <div class="editorial-detail-nav">
      <NuxtLink :to="labels.list" class="editorial-back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />{{ labels.back }}</NuxtLink>
      <EditorialShare v-if="entry" :url="canonical" :title="shareTitle" />
    </div>
    <div v-if="status === 'pending'" class="editorial-detail-state surface-card" role="status">读取中…</div>
    <UAlert v-else-if="failed" color="error" variant="subtle" role="alert" :title="labels.read" description="内容暂时不可用，请稍后重试。" />
    <UAlert v-else-if="!entry" color="neutral" variant="subtle" role="alert" :title="labels.missing" description="该地址对应的内容不存在或已移除。">
      <template #actions><UButton :to="labels.list" :label="labels.back" color="neutral" variant="outline" /></template>
    </UAlert>
    <template v-else>
      <EditorialArticle :entry="entry" :kind="kind" :toc="toc" :minutes="minutes" />
      <footer class="editorial-detail-footer">
        <div class="editorial-detail-share">
          <p class="type-label">觉得有用？把这篇分享给朋友。</p>
          <EditorialShare :url="canonical" :title="shareTitle" />
        </div>
        <EditorialNeighbors :older="older" :newer="newer" />
      </footer>
      <aside v-if="toc.length >= 3" class="editorial-aside"><EditorialToc :entries="toc" spy /></aside>
    </template>
   </div>
  </main>
</template>

<style scoped>
.editorial-detail-page { container-type: inline-size; }
.editorial-frame { display: grid; grid-template-columns: minmax(0, 44rem); justify-content: center; padding-block: clamp(1.75rem, 6vh, 4.5rem) 3rem; }
.editorial-frame > * { grid-column: 1; min-width: 0; }
.editorial-detail-nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); margin-bottom: var(--space-6); }
.editorial-back-link { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--type-caption-size); font-weight: 500; text-decoration: none; }
.editorial-detail-state { min-height: 260px; display: grid; place-items: center; color: var(--muted); }
.editorial-detail-footer { display: grid; gap: var(--space-6); margin-top: var(--space-12); padding-top: var(--space-8); border-top: 1px solid var(--line); }
.editorial-detail-share { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.editorial-detail-share p { margin: 0; }
.editorial-aside { display: none; }
/* The contents list takes the right gutter once the frame is wide enough for both columns. */
@container (min-width: 62rem) {
  .editorial-frame.has-toc { grid-template-columns: minmax(0, 44rem) 13rem; column-gap: var(--space-12); }
  .editorial-aside { display: block; grid-column: 2; grid-row: 1 / span 3; }
  .editorial-aside :deep(.editorial-toc) { position: sticky; top: calc(var(--sticky-chrome-top) + var(--space-4)); max-height: calc(100dvh - var(--sticky-chrome-top) - var(--space-8)); overflow-y: auto; }
}
@container (max-width: 47.99rem) { .editorial-detail-footer { margin-top: var(--space-8); } }
</style>
