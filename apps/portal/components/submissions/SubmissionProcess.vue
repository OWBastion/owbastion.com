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
      <li v-for="step in steps" :key="step.title">
        <strong>{{ step.title }}</strong>
        <span>{{ step.detail }}</span>
      </li>
    </ol>
  </UCard>
</template>

<style scoped>
.process-card { padding: 20px 22px; }
.process-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.process-heading > svg { width: 19px; height: 19px; color: var(--muted); }
.process-heading h2 { margin: 0; font-size: .98rem; letter-spacing: -.02em; }
.process-steps { display: grid; gap: 10px; margin: 0; padding-left: 1.45em; color: var(--muted); }
.process-steps li { padding-left: 4px; }
.process-steps li::marker { color: var(--quiet); font-size: .74rem; font-weight: 700; }
.process-steps strong { display: block; color: var(--text); font-size: .86rem; font-weight: 720; }
.process-steps span { display: block; margin-top: 2px; color: var(--muted); font-size: .76rem; line-height: 1.45; }
</style>
