<script setup lang="ts">
import type { ReleaseDiff } from "~/composables/useReleasePlane";

defineProps<{ diff: readonly ReleaseDiff[]; loading?: boolean }>();

const contentLabels: Record<ReleaseDiff["contentType"], string> = {
  event: "事件",
  map: "地图",
  title: "称号",
  challenge: "挑战",
};
const changeLabels: Record<ReleaseDiff["change"], string> = {
  added: "新增",
  modified: "修改",
  removed: "移除",
};
const formatJson = (value: Record<string, unknown> | null) => value ? JSON.stringify(value, null, 2) : "—";
</script>

<template>
  <section class="diff-section" aria-labelledby="release-diff-title">
    <div class="diff-heading">
      <div>
        <p class="eyebrow">自动变更摘要</p>
        <h3 id="release-diff-title">工作目录 → Current</h3>
      </div>
      <StatusBadge :label="`${diff.length} 项变化`" :tone="diff.length ? 'warning' : 'success'" />
    </div>
    <div v-if="loading" class="diff-empty">正在读取 Draft…</div>
    <div v-else-if="!diff.length" class="diff-empty">工作目录与 Current 相同，没有需要发布的内容。</div>
    <div v-else class="diff-table-wrap">
      <table class="diff-table">
        <thead><tr><th>类型</th><th>内容</th><th>状态</th><th>Current</th><th>Draft</th></tr></thead>
        <tbody>
          <tr v-for="change in diff" :key="`${change.contentType}:${change.contentId}`">
            <td>{{ contentLabels[change.contentType] ?? change.contentType }}</td>
            <td><strong>{{ change.contentId }}</strong></td>
            <td><StatusBadge :label="changeLabels[change.change] ?? change.change" :tone="change.change === 'added' ? 'success' : 'warning'" /></td>
            <td><code class="diff-value">{{ formatJson(change.before) }}</code></td>
            <td><code class="diff-value">{{ formatJson(change.after) }}</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.diff-section { display:grid; gap:16px; margin-top:24px; }.diff-heading { display:flex; align-items:end; justify-content:space-between; gap:16px; }.diff-heading h3 { margin:4px 0 0; font-size:1.1rem; }.eyebrow { margin:0; color:var(--accent); font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; }.diff-empty { padding:24px 0; color:var(--quiet); border-block:1px solid var(--line); }.diff-table-wrap { overflow-x:auto; border-block:1px solid var(--line); }.diff-table { width:100%; min-width:820px; border-collapse:collapse; font-size:.82rem; }.diff-table th,.diff-table td { padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }.diff-table th { color:var(--quiet); font-size:.72rem; font-weight:500; letter-spacing:.08em; text-transform:uppercase; }.diff-table tr:last-child td { border-bottom:0; }.diff-table strong { display:block; max-width:190px; overflow-wrap:anywhere; font-weight:600; }.diff-value { display:block; max-width:360px; max-height:180px; overflow:auto; white-space:pre-wrap; color:var(--quiet); line-height:1.45; }
</style>
