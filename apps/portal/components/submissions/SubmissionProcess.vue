<script setup lang="ts">
const steps = [
  { title: "上传截图", detail: "选择并上传游戏内完成截图" },
  { title: "截图识别", detail: "系统自动识别地图与通关信息" },
  { title: "核对结果", detail: "确认挑战并等待平台核对" },
  { title: "获得称号", detail: "核对通过后自动获得称号" },
];
</script>

<template>
  <UCard class="process-card" variant="subtle" aria-labelledby="process-title">
    <div class="process-heading">
      <UIcon name="i-lucide-circle-help" aria-hidden="true" />
      <h2 id="process-title">获得称号流程</h2>
    </div>
    <ol class="process-steps">
      <li v-for="step in steps" :key="step.title" class="process-step">
        <strong>{{ step.title }}</strong>
        <span>{{ step.detail }}</span>
      </li>
    </ol>
  </UCard>
</template>

<style scoped>
.process-card { padding: var(--space-5); }
.process-heading { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-5); }
.process-heading > svg { width: 19px; height: 19px; color: var(--muted); }
.process-heading h2 { margin: 0; font-size: .98rem; letter-spacing: -.02em; }
.process-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-4); margin: 0; padding: 0; list-style: none; counter-reset: step; }
.process-step { display: grid; grid-template-columns: auto 1fr; column-gap: var(--space-3); align-items: start; counter-increment: step; }
.process-step::before {
  content: counter(step);
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  grid-row: span 2;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface-raised);
  color: var(--text);
  font-size: var(--type-label-sm-size);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.process-step strong { color: var(--text); font-size: var(--type-label-size); font-weight: 600; }
.process-step span { margin-top: var(--space-1); color: var(--muted); font-size: var(--type-label-sm-size); line-height: 1.45; }
</style>
