<script setup lang="ts">
type StepState = "complete" | "current" | "upcoming" | "failed";

const props = defineProps<{ status: string; resubmissionRequired?: boolean }>();

const steps = ["上传", "识别", "核对", "称号"];
const stateLabel: Record<StepState, string> = { complete: "已完成", current: "进行中", upcoming: "待处理", failed: "未通过" };

const states = computed<StepState[]>(() => {
  switch (props.status) {
    case "processing": return ["complete", "current", "upcoming", "upcoming"];
    case "needs_review": return ["complete", "complete", "current", "upcoming"];
    case "completed": return ["complete", "complete", "complete", "complete"];
    case "rejected": return props.resubmissionRequired ? ["complete", "failed", "upcoming", "upcoming"] : ["complete", "complete", "failed", "upcoming"];
    default: return ["current", "upcoming", "upcoming", "upcoming"];
  }
});
const label = (state: StepState) => state === "failed" && props.resubmissionRequired ? "需重新提交" : stateLabel[state];
</script>

<template>
  <ol class="progress" aria-label="提交进度">
    <li v-for="(step, index) in steps" :key="step" :class="`is-${states[index]}`" role="img" :aria-label="`${step}：${label(states[index] ?? 'upcoming')}`">
      <span aria-hidden="true">{{ step }}</span>
    </li>
  </ol>
</template>

<style scoped>
.progress { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.progress li { --bar: var(--line); display: grid; gap: var(--space-2); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 600; }
.progress li::before { height: 4px; border-radius: var(--radius-pill); background: var(--bar); content: ""; }
.progress .is-complete { --bar: var(--accent); }
.progress .is-current { --bar: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent); }
.progress .is-current::before { animation: pulse 1.6s ease-in-out infinite; }
.progress .is-failed { --bar: var(--warning); color: var(--warning); }
@keyframes pulse { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .progress .is-current::before { animation: none; } }
</style>
