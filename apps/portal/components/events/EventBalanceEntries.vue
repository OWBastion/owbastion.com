<script setup lang="ts">
import type { MDCRoot } from "@nuxtjs/mdc";
import type { EventHistoryEntry } from "../../content/event-history";
import { formatEditorialDate } from "~/utils/editorial";

defineProps<{ entries: EventHistoryEntry[] }>();
const body = (nodes: unknown[]) => ({ type: "root", children: nodes }) as MDCRoot;
</script>

<template>
  <ol class="balance-entries">
    <li v-for="item in entries" :key="`${item.version}-${item.tag}-${item.scope}`" class="balance-entries__item">
      <div class="balance-entries__meta">
        <NuxtLink :to="item.path" class="balance-entries__version num">{{ item.version }}</NuxtLink>
        <time :datetime="item.releasedAt">{{ formatEditorialDate(item.releasedAt) }}</time>
        <UBadge v-if="item.tag" :label="item.tag" color="neutral" variant="subtle" />
        <UBadge v-if="item.scope" :label="item.scope" color="info" variant="outline" />
        <span v-if="item.formerName">时称「{{ item.formerName }}」</span>
      </div>
      <MDCRenderer :body="body(item.body)" :data="{}" class="balance-entries__body" />
    </li>
  </ol>
</template>

<style scoped>
.balance-entries { display: grid; gap: var(--space-4); margin: 0; padding: 0 0 0 var(--space-4); border-left: 1px solid var(--line); list-style: none; }
.balance-entries__item { display: grid; gap: var(--space-1); }
.balance-entries__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); }
.balance-entries__version { color: var(--text); font-weight: 600; }
.balance-entries__body { font-size: var(--type-caption-size); line-height: 1.7; }
.balance-entries__body :deep(ul) { margin: 0; padding-inline-start: 1.1rem; list-style: disc; }
.balance-entries__body :deep(blockquote) { margin: 0; color: var(--muted); }
.balance-entries__body :deep(p) { margin: 0; }
</style>
