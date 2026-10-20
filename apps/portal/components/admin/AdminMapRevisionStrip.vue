<script setup lang="ts">
import type { AdminMapEditorRevision } from "~/composables/useAdminMapEditor";
import { lifecycleLabels, lifecycleTone } from "~/utils/map-lifecycle";

defineProps<{
  revisions: AdminMapEditorRevision[];
  selectedRevisionId: string;
  dirtyRevisionIds?: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ select: [revisionId: string]; create: [] }>();

const revisionName = (revision: AdminMapEditorRevision) => revision.mode ?? (revision.mapVariant === "classic" ? "经典版" : "标准版");
const honorCount = (revision: AdminMapEditorRevision) => revision.challengeAssignments.filter((assignment) => assignment.enabled).length;
</script>

<template>
  <div class="revision-strip">
    <UTabs
      :model-value="selectedRevisionId"
      :items="revisions.map((revision) => ({ value: revision.revisionId, revision, disabled }))"
      :content="false"
      variant="pill"
      aria-label="版本修订"
      :ui="{ list: 'gap-2.5 bg-transparent p-0', indicator: 'hidden', trigger: 'revision-card data-[state=active]:border-[var(--accent)] data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:ring-[3px] data-[state=active]:ring-[var(--accent-surface)]' }"
      @update:model-value="emit('select', String($event))"
    >
      <template #default="{ item }">
        <span class="revision-card__top">
          <strong>{{ revisionName(item.revision) }}</strong>
          <StatusBadge :label="lifecycleLabels[item.revision.lifecycle]" :tone="lifecycleTone(item.revision.lifecycle)" />
          <span v-if="dirtyRevisionIds?.includes(item.revision.revisionId)" class="revision-card__dirty" role="img" aria-label="有未保存的修改" />
        </span>
        <span class="revision-card__meta">{{ item.revision.gameVersion }} · {{ honorCount(item.revision) }} 项分配</span>
      </template>
    </UTabs>
    <UButton label="＋ 新建修订" color="neutral" variant="outline" class="revision-card--add" :disabled="disabled" @click="emit('create')" />
  </div>
</template>

<style scoped>
.revision-strip { display: flex; gap: 0.625rem; padding: 0.25rem; margin: -0.25rem; overflow-x: auto; scrollbar-width: none; }
.revision-strip :deep(.revision-card) { display: grid; flex: 0 0 auto; gap: 0.25rem; min-width: 11.5rem; padding: 0.6875rem 0.875rem; border: 1.5px solid var(--line); border-radius: var(--radius-card); color: var(--text); background: var(--surface); text-align: left; }
.revision-strip :deep(.revision-card:hover) { border-color: var(--line-strong); }
.revision-card__top { display: flex; align-items: center; gap: 0.5rem; }
.revision-card__top strong { font-size: 0.9375rem; white-space: nowrap; }
.revision-card__meta { color: var(--quiet); font-size: var(--type-caption-size); white-space: nowrap; }
.revision-card__dirty { width: 0.5rem; height: 0.5rem; margin-left: auto; border-radius: 50%; background: var(--accent); }
.revision-card--add { flex: 0 0 auto; border-style: dashed; }
</style>
