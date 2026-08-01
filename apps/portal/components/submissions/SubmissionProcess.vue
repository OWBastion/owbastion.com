<script setup lang="ts">
import type { StepperItem } from "@nuxt/ui";

const steps: StepperItem[] = [
  { icon: "i-lucide-upload", title: "上传截图" },
  { icon: "i-lucide-scan-line", title: "截图识别" },
  { icon: "i-lucide-user-round-check", title: "核对结果" },
  { icon: "i-lucide-award", title: "获得称号" },
  { icon: "i-lucide-refresh-cw", title: "游戏内同步" },
];
</script>

<template>
  <UCard class="process-card" variant="subtle" aria-labelledby="process-title">
    <div class="process-heading">
      <UIcon name="i-lucide-circle-help" aria-hidden="true" />
      <h2 id="process-title">获得称号流程</h2>
    </div>
    <UStepper
      :items="steps"
      size="sm"
      color="neutral"
      disabled
      class="process-stepper"
    />
  </UCard>
</template>

<style scoped>
.process-card { padding: 20px 22px; }
.process-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.process-heading > svg { width: 19px; height: 19px; color: var(--muted); }
.process-heading h2 { margin: 0; font-size: .98rem; letter-spacing: -.02em; }
.process-stepper { width: 100%; }
</style>
