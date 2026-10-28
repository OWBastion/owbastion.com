<script setup lang="ts">
import type { AdminMapEditorAudit } from "~/composables/useAdminMapEditor";
import { lifecycleLabels, lifecycleTone } from "~/utils/map-lifecycle";

defineProps<{ audit: AdminMapEditorAudit[] }>();

const labels: Record<string, string> = {
  "admin.map.metadata.update": "保存地图资料",
  "admin.map.revision.create": "创建版本修订",
  "admin.map.revision.update": "保存版本修订",
};
const lifecycleBadge = (lifecycle: unknown) => {
  const known = lifecycle as keyof typeof lifecycleLabels;
  return known in lifecycleLabels ? { label: lifecycleLabels[known], tone: lifecycleTone(known) } : { label: "—", tone: "default" as const };
};
const detail = (item: AdminMapEditorAudit) => {
  const payload = item.payload;
  if (item.operation === "admin.map.revision.create") return payload.progressCopied === false ? "复制配置；未复制进度" : "创建版本修订";
  return "地图资料变更";
};
</script>

<template>
  <ol v-if="audit.length" class="audit-list">
    <li v-for="item in audit" :key="`${item.createdAt}:${item.operation}:${item.entityId}`">
      <div>
        <strong>{{ labels[item.operation] ?? "地图编辑" }}</strong>
        <p v-if="item.operation === 'admin.map.revision.update'" class="audit-lifecycle">状态：<StatusBadge v-bind="lifecycleBadge(item.payload.previousLifecycle)" /> → <StatusBadge v-bind="lifecycleBadge(item.payload.lifecycle)" />；未复制进度</p>
        <p v-else>{{ detail(item) }}</p>
      </div>
      <span>{{ formatTime(item.createdAt) }}</span>
    </li>
  </ol>
  <UEmpty v-else title="暂无地图编辑记录" />
</template>

<style scoped>
.audit-list { display: grid; padding: 0; margin: 0; list-style: none; border-top: 1px solid var(--line); }
.audit-list li { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--line); }
.audit-list strong { font-size: 0.875rem; }
.audit-list p, .audit-lifecycle { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
.audit-list > li > span { margin: 0.25rem 0 0; color: var(--quiet); font-size: var(--type-caption-size); }
.audit-list span { flex: 0 0 auto; margin: 0; }
</style>
