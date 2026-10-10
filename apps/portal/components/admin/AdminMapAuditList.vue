<script setup lang="ts">
import type { AdminMapEditorAudit } from "~/composables/useAdminMapEditor";

defineProps<{ audit: AdminMapEditorAudit[] }>();

const labels: Record<string, string> = {
  "admin.map.metadata.update": "保存地图资料",
  "admin.map.revision.create": "创建版本修订",
  "admin.map.revision.update": "保存版本修订",
};
const detail = (item: AdminMapEditorAudit) => {
  const payload = item.payload;
  if (item.operation === "admin.map.revision.create") return payload.progressCopied === false ? "复制配置；未复制进度" : "创建版本修订";
  if (item.operation === "admin.map.revision.update") return `状态：${String(payload.previousLifecycle ?? "—")} → ${String(payload.lifecycle ?? "—")}；未复制进度`;
  return "地图资料变更";
};
const format = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
</script>

<template>
  <ol v-if="audit.length" class="audit-list">
    <li v-for="item in audit" :key="`${item.createdAt}:${item.operation}:${item.entityId}`">
      <div>
        <strong>{{ labels[item.operation] ?? item.operation }}</strong>
        <p>{{ detail(item) }}</p>
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
.audit-list p, .audit-list span { margin: 0.25rem 0 0; color: var(--quiet); font-size: var(--type-caption-size); }
.audit-list span { flex: 0 0 auto; margin: 0; }
</style>
