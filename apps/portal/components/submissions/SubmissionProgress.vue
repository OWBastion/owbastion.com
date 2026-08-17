<script setup lang="ts">
type StepState = "complete" | "current" | "upcoming" | "failed";
type ProgressStep = { key: string; title: string; icon: string; detail: string };

const props = defineProps<{ status: string; updatedAt: number }>();

const steps: ProgressStep[] = [
  { key: "submitted", title: "已提交", icon: "i-lucide-check", detail: "截图已提交" },
  { key: "ocr", title: "截图识别", icon: "i-lucide-scan-line", detail: "等待识别" },
  { key: "review", title: "核对结果", icon: "i-lucide-user-round-check", detail: "等待核对" },
  { key: "grant", title: "获得称号", icon: "i-lucide-award", detail: "核对通过后获得称号" },
];

const stepStates = computed<StepState[]>(() => {
  switch (props.status) {
    case "received":
    case "evidence_pending":
    case "evidence_stored":
    case "upload_pending":
      return ["current", "upcoming", "upcoming", "upcoming"];
    case "ocr_pending":
      return ["complete", "current", "upcoming", "upcoming"];
    case "awaiting_player_confirmation":
      return ["complete", "current", "upcoming", "upcoming"];
    case "ready_for_review":
    case "ocr_review_required":
      return ["complete", "complete", "current", "upcoming"];
    case "approved":
      return ["complete", "complete", "complete", "complete"];
    case "rejected":
      return ["complete", "complete", "failed", "upcoming"];
    case "resubmission_required":
      return ["complete", "failed", "upcoming", "upcoming"];
    default:
      return ["current", "upcoming", "upcoming", "upcoming"];
  }
});

const stepDetails = computed(() => steps.map((step, index) => {
  const state = stepStates.value[index];
  if (step.key === "ocr" && state === "current" && props.status === "awaiting_player_confirmation") return "等待确认挑战";
  if (step.key === "ocr" && state === "failed") return "未通过";
  if (step.key === "review" && state === "current" && props.status === "ocr_review_required") return "等待处理";
  if (step.key === "review" && state === "failed") return "未通过";
  if (state === "complete") return "已完成";
  return step.detail;
}));

const stateLabel: Record<StepState, string> = {
  complete: "已完成",
  current: "进行中",
  upcoming: "待处理",
  failed: "未通过",
};

const stepIcon = (step: ProgressStep, state: StepState) => state === "complete" ? "i-lucide-check" : state === "failed" ? "i-lucide-x" : step.icon;
const progressItems = computed(() => steps.map((step, index) => {
  const state = stepStates.value[index] ?? "upcoming";
  return { ...step, state, detail: stepDetails.value[index] ?? step.detail, stateLabel: stateLabel[state], icon: stepIcon(step, state) };
}));
</script>

<template>
  <UCard class="progress-card elevation-2" aria-labelledby="submission-progress-title">
    <template #header><div class="card-heading"><h2 id="submission-progress-title">提交进度</h2></div></template>
    <ol class="progress-list">
      <li v-for="step in progressItems" :key="step.key" class="progress-item" :class="`progress-item--${step.state}`">
        <div class="progress-marker" :aria-label="`${step.title}：${step.stateLabel}`"><UIcon :name="step.icon" aria-hidden="true" /></div>
        <div class="progress-copy"><div class="progress-title"><strong>{{ step.title }}</strong><span>{{ step.stateLabel }}</span></div><p>{{ step.detail }}</p></div>
      </li>
    </ol>
  </UCard>
</template>

<style scoped>
.progress-card { border-color: var(--line); }
.progress-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.progress-item { position: relative; display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; min-height: 68px; }
.progress-item:not(:last-child)::after { position: absolute; top: 32px; bottom: 0; left: 15px; width: 1px; background: var(--line); content: ""; }
.progress-marker {
  position: relative;
  z-index: 1;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--quiet);
  background: var(--surface-raised);
  transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
.progress-marker > svg { width: 16px; height: 16px; }
.progress-copy { min-width: 0; padding: 4px 0 16px; }
.progress-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.progress-title strong { color: var(--text); font-size: .86rem; font-weight: 720; transition: color 160ms ease; }
.progress-title span { color: var(--quiet); font-size: .7rem; white-space: nowrap; transition: color 160ms ease; }
.progress-copy p { margin: 4px 0 0; color: var(--muted); font-size: .76rem; line-height: 1.45; }
.progress-item--complete .progress-marker { border-color: color-mix(in oklch, var(--accent) 38%, var(--line)); color: var(--accent); background: var(--accent-surface); }
.progress-item--complete .progress-title span { color: var(--accent); }
.progress-item--current .progress-marker { border-color: var(--accent); color: var(--on-accent); background: var(--accent); box-shadow: 0 4px 14px -8px var(--accent); }
.progress-item--current .progress-title strong, .progress-item--current .progress-title span { color: var(--accent); }
.progress-item--failed .progress-marker { border-color: color-mix(in oklch, var(--warning) 58%, var(--line)); color: var(--warning); background: color-mix(in oklch, var(--warning) 12%, var(--surface)); }
.progress-item--failed .progress-title strong, .progress-item--failed .progress-title span { color: var(--warning); }
@media (prefers-reduced-transparency: reduce) { .progress-item--complete .progress-marker, .progress-item--failed .progress-marker { background: var(--surface); } }
@media (prefers-contrast: more) { .progress-card { border-color: var(--text); } .progress-marker { border-color: var(--text); } }
</style>
