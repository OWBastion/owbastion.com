<script setup lang="ts">
import type { AdminMapEditorRevision } from "~/composables/useAdminMapEditor";

defineProps<{
  revisions: AdminMapEditorRevision[];
  selectedRevisionId: string;
  dirtyRevisionIds?: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ select: [revisionId: string]; create: [] }>();

const lifecycleLabels: Record<AdminMapEditorRevision["lifecycle"], string> = { preparing: "准备中", default: "正式", selectable: "可选", historical: "历史" };
const lifecycleTone = (lifecycle: AdminMapEditorRevision["lifecycle"]) => lifecycle === "default" ? "success" : lifecycle === "selectable" ? "info" : lifecycle === "historical" ? "default" : "warning";
const revisionName = (revision: AdminMapEditorRevision) => revision.mode ?? (revision.mapVariant === "classic" ? "经典版" : "标准版");
const honorCount = (revision: AdminMapEditorRevision) => revision.challengeAssignments.filter((assignment) => assignment.enabled).length;
</script>

<template>
  <div class="revision-strip" role="tablist" aria-label="版本修订">
    <button
      v-for="revision in revisions"
      :key="revision.revisionId"
      type="button"
      role="tab"
      class="revision-card pressable-soft"
      :aria-selected="revision.revisionId === selectedRevisionId"
      :disabled="disabled"
      @click="emit('select', revision.revisionId)"
    >
      <span class="revision-card__top">
        <strong>{{ revisionName(revision) }}</strong>
        <StatusBadge :label="lifecycleLabels[revision.lifecycle]" :tone="lifecycleTone(revision.lifecycle)" />
        <span v-if="dirtyRevisionIds?.includes(revision.revisionId)" class="revision-card__dirty" role="img" aria-label="有未保存的修改" />
      </span>
      <span class="revision-card__meta">{{ revision.gameVersion }} · {{ honorCount(revision) }} 项分配</span>
    </button>
    <button type="button" class="revision-card revision-card--add pressable-soft" :disabled="disabled" @click="emit('create')">＋ 新建修订</button>
  </div>
</template>

<style scoped>
.revision-strip { display: flex; gap: 0.625rem; padding: 0.25rem; margin: -0.25rem; overflow-x: auto; scrollbar-width: none; }
.revision-card { flex: 0 0 auto; display: grid; gap: 0.25rem; min-width: 11.5rem; padding: 0.6875rem 0.875rem; border: 1.5px solid var(--line); border-radius: var(--radius-card); color: var(--text); background: var(--surface); text-align: left; }
.revision-card:hover { border-color: var(--line-strong); }
.revision-card[aria-selected="true"] { border-color: var(--accent); background: var(--surface-raised); box-shadow: 0 0 0 3px var(--accent-surface); }
.revision-card__top { display: flex; align-items: center; gap: 0.5rem; }
.revision-card__top strong { font-size: 0.9375rem; white-space: nowrap; }
.revision-card__meta { color: var(--quiet); font-size: var(--type-caption-size); white-space: nowrap; }
.revision-card__dirty { width: 0.5rem; height: 0.5rem; margin-left: auto; border-radius: 50%; background: var(--accent); }
.revision-card--add { min-width: auto; place-content: center; border-style: dashed; color: var(--muted); background: transparent; font-weight: 500; }
</style>
