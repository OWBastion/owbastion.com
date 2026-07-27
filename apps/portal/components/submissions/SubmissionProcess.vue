<script setup lang="ts">
const steps = [
  { icon: "i-lucide-upload", label: "上传截图" },
  { icon: "i-lucide-scan-line", label: "AI 识别" },
  { icon: "i-lucide-user-round-check", label: "人工核对" },
  { icon: "i-lucide-award", label: "发放称号" },
  { icon: "i-lucide-refresh-cw", label: "游戏内同步" },
];
</script>

<template>
  <UCard class="process-card" variant="subtle" aria-labelledby="process-title">
    <div class="process-heading">
      <UIcon name="i-lucide-circle-help" aria-hidden="true" />
      <h2 id="process-title">提交后会怎样？</h2>
    </div>
    <ol class="process-list">
      <li v-for="(step, index) in steps" :key="step.label">
        <div class="process-step"><UIcon :name="step.icon" aria-hidden="true" /><span>{{ step.label }}</span></div>
        <UIcon v-if="index < steps.length - 1" name="i-lucide-arrow-right" class="process-arrow" aria-hidden="true" />
      </li>
    </ol>
  </UCard>
</template>

<style scoped>
.process-card { padding: 20px 22px; }
.process-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.process-heading > svg { width: 19px; height: 19px; color: var(--muted); }
.process-heading h2 { margin: 0; font-size: .98rem; letter-spacing: -.02em; }
.process-list { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 0; list-style: none; }
.process-list li { display: flex; flex: 1 1 0; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.process-step { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--muted); font-size: .78rem; white-space: nowrap; }
.process-step > svg { flex: 0 0 auto; width: 17px; height: 17px; color: var(--quiet); }
.process-arrow { flex: 0 0 auto; width: 18px; height: 18px; color: var(--quiet); }
@media (max-width: 760px) { .process-list { align-items: stretch; flex-direction: column; gap: 0; }.process-list li { flex: none; min-height: 40px; }.process-arrow { align-self: flex-start; margin-left: 1px; transform: rotate(90deg); } }
</style>
