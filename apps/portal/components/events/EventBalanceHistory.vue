<script setup lang="ts">
import type { MDCRoot } from "@nuxtjs/mdc";
import type { EventHistoryEntry } from "../../content/event-history";
import { findEventHistory } from "~/utils/editorial-content";
import { formatEditorialDate } from "~/utils/editorial";

const props = defineProps<{ eventId: string }>();
const history = shallowRef<EventHistoryEntry[]>([]);
watch(() => props.eventId, async (eventId) => {
  history.value = [];
  const found = await findEventHistory(eventId);
  if (eventId === props.eventId) history.value = found;
}, { immediate: true });
const body = (nodes: unknown[]) => ({ type: "root", children: nodes }) as MDCRoot;
</script>

<template>
  <section v-if="history.length" class="balance-history" aria-label="平衡调整记录">
    <h3 class="type-card-title">平衡调整记录</h3>
    <ol class="balance-history__list">
      <li v-for="item in history" :key="item.version" class="balance-history__item">
        <div class="balance-history__meta">
          <NuxtLink :to="item.path" class="balance-history__version num">{{ item.version }}</NuxtLink>
          <time :datetime="item.releasedAt">{{ formatEditorialDate(item.releasedAt) }}</time>
          <UBadge v-if="item.tag" :label="item.tag" color="neutral" variant="subtle" />
        </div>
        <MDCRenderer :body="body(item.body)" :data="{}" class="balance-history__body" />
      </li>
    </ol>
  </section>
</template>

<style scoped>
.balance-history { display: grid; gap: var(--space-3); }
.balance-history__list { display: grid; gap: var(--space-4); margin: 0; padding: 0 0 0 var(--space-4); border-left: 1px solid var(--line); list-style: none; }
.balance-history__item { display: grid; gap: var(--space-1); }
.balance-history__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); }
.balance-history__version { color: var(--text); font-weight: 600; }
.balance-history__body { font-size: var(--type-caption-size); line-height: 1.7; }
.balance-history__body :deep(ul) { margin: 0; padding-inline-start: 1.1rem; list-style: disc; }
.balance-history__body :deep(blockquote) { margin: 0; color: var(--muted); }
.balance-history__body :deep(p) { margin: 0; }
</style>
