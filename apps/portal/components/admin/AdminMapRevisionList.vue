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
      <div>
        <p class="eyebrow">公平边界</p>
        <h2 id="revision-list-title">Gameplay revisions</h2>
      </div>
      <span class="section-count">{{ props.revisions.length }} 个</span>
    </header>
    <p class="section-note">默认和可选 revision 才会同步到 Bastion；准备中与历史 revision 保留在平台上供审计。</p>
    <ol class="revision-list__items">
      <li v-for="revision in props.revisions" :key="revision.revisionId">
        <button
          type="button"
          class="revision-card"
          :class="{ 'revision-card--selected': revision.revisionId === props.selectedRevisionId }"
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
.revision-list { display: grid; gap: 12px; align-content: start; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.section-heading h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.02em; }
.section-heading .eyebrow { margin: 0 0 5px; }
.section-count, .section-note, .revision-card__meta, .revision-card__date { color: var(--quiet); font-size: var(--type-caption-size); }
.section-note { margin: 0; line-height: 1.55; }
.revision-list__items { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
.revision-card { display: grid; gap: 8px; width: 100%; padding: 13px 14px; border: 1px solid var(--line); border-radius: 13px; color: var(--text); background: var(--surface); text-align: left; transition: border-color 120ms ease, background-color 120ms ease; }
.revision-card:hover { border-color: var(--line-strong); background: var(--surface-raised); }
.revision-card--selected { border-color: var(--accent); background: var(--accent-surface); box-shadow: inset 3px 0 0 var(--accent); }
.revision-card__topline, .revision-card__meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.revision-card__topline strong { overflow-wrap: anywhere; font-size: .84rem; }
.revision-card__meta { justify-content: flex-start; flex-wrap: wrap; }
.revision-card__date { text-align: left; }
</style>
