<script setup lang="ts">
import type { AdminMapEditorAudit } from "~/composables/useAdminMapEditor";

defineProps<{ audit: AdminMapEditorAudit[] }>();

const labels: Record<string, string> = {
  "admin.map.metadata.update": "保存地图资料",
  "admin.map.revision.create": "创建版本修订",
  "admin.map.revision.update": "保存版本修订",
};
const lifecycleLabels: Record<string, string> = { preparing: "准备中", default: "正式", selectable: "可选", historical: "历史" };
const lifecycleTone = (lifecycle: unknown) => lifecycle === "default" ? "success" : lifecycle === "selectable" ? "info" : lifecycle === "historical" ? "default" : "warning";
const lifecycleBadge = (lifecycle: unknown) => ({ label: lifecycleLabels[String(lifecycle)] ?? "—", tone: lifecycleTone(lifecycle) as "success" | "info" | "default" | "warning" });
const detail = (item: AdminMapEditorAudit) => {
  const payload = item.payload;
  if (item.operation === "admin.map.revision.create") return payload.progressCopied === false ? "复制配置；未复制进度" : "创建版本修订";
  return "地图资料变更";
};
const format = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
</script>

<template>
  <ol v-if="audit.length" class="audit-list">
    <li v-for="item in audit" :key="`${item.createdAt}:${item.operation}:${item.entityId}`">
      <div>
        <strong>{{ labels[item.operation] ?? item.operation }}</strong>
        <p v-if="item.operation === 'admin.map.revision.update'" class="audit-lifecycle">状态：<StatusBadge v-bind="lifecycleBadge(item.payload.previousLifecycle)" /> → <StatusBadge v-bind="lifecycleBadge(item.payload.lifecycle)" />；未复制进度</p>
        <p v-else>{{ detail(item) }}</p>
      </div>
      <span>{{ format.format(item.createdAt) }}</span>
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
