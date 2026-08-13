<script setup lang="ts">
import type { AdminMapEditorRevision } from "~/composables/useAdminMapEditor";

const props = defineProps<{
  revisions: AdminMapEditorRevision[];
  selectedRevisionId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ select: [revisionId: string] }>();

const lifecycleLabels: Record<AdminMapEditorRevision["lifecycle"], string> = {
  preparing: "准备中",
  default: "默认",
  selectable: "可选",
  historical: "历史",
};
const lifecycleTone = (lifecycle: AdminMapEditorRevision["lifecycle"]) => lifecycle === "default" ? "success" : lifecycle === "selectable" ? "info" : lifecycle === "historical" ? "default" : "warning";
const dateLabel = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
</script>

<template>
  <section class="revision-list" aria-labelledby="revision-list-title">
    <header class="section-heading">
      <h2 id="revision-list-title" class="type-headline">版本修订</h2>
      <span class="section-count">{{ props.revisions.length }} 个</span>
    </header>
    <ol class="revision-list__items">
      <li v-for="revision in props.revisions" :key="revision.revisionId">
        <button
          type="button"
          class="revision-card pressable-soft"
          :class="{ 'revision-card--selected': revision.revisionId === props.selectedRevisionId }"
          :aria-pressed="revision.revisionId === props.selectedRevisionId"
          :disabled="props.disabled"
          @click="emit('select', revision.revisionId)"
        >
          <span class="revision-card__topline">
            <strong>{{ revision.revisionId }}</strong>
            <StatusBadge :label="lifecycleLabels[revision.lifecycle]" :tone="lifecycleTone(revision.lifecycle)" />
          </span>
          <span class="revision-card__meta">
            <span>{{ revision.gameVersion }}</span>
            <span>{{ revision.mapVariant === "classic" ? "经典版" : "正式版" }}</span>
            <span>{{ revision.challengeAssignments.length }} 项分配</span>
          </span>
          <span class="revision-card__date">更新于 {{ dateLabel(revision.updatedAt) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.revision-list { display: grid; gap: 0.75rem; align-content: start; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.section-heading h2 { margin: 0; }
.section-count, .revision-card__meta, .revision-card__date { color: var(--quiet); font-size: var(--type-caption-size); }
.revision-list__items { display: grid; gap: 0.5rem; padding: 0; margin: 0; list-style: none; }
.revision-card { display: grid; gap: 0.5rem; width: 100%; padding: 0.8125rem 0.875rem; border: 1px solid var(--line); border-radius: 0.8125rem; color: var(--text); background: var(--surface); text-align: left; }
.revision-card:hover { border-color: var(--line-strong); background: var(--surface-raised); }
.revision-card--selected { border-color: var(--accent); background: var(--accent-surface); box-shadow: inset 3px 0 0 var(--accent); }
.revision-card__topline, .revision-card__meta { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.revision-card__topline strong { overflow-wrap: anywhere; font-size: var(--type-caption-size); }
.revision-card__meta { justify-content: flex-start; flex-wrap: wrap; }
.revision-card__date { text-align: left; }
</style>
