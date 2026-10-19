<script setup lang="ts">
type StepState = "complete" | "current" | "upcoming" | "failed";
type ProgressStep = { key: string; title: string; icon: string; detail: string; intro: string };

// Without a status this is the static pre-submission flow; with one it tracks a submission.
const props = defineProps<{ status?: string; updatedAt?: number; resubmissionRequired?: boolean }>();

const steps: ProgressStep[] = [
  { key: "upload", title: "上传截图", icon: "i-lucide-check", detail: "截图已提交", intro: "选择并上传游戏内完成截图" },
  { key: "ocr", title: "截图识别", icon: "i-lucide-scan-line", detail: "等待识别", intro: "系统自动识别地图与通关信息" },
  { key: "review", title: "核对结果", icon: "i-lucide-user-round-check", detail: "等待核对", intro: "确认挑战并等待平台核对" },
  { key: "grant", title: "获得称号", icon: "i-lucide-award", detail: "核对通过后获得称号", intro: "核对通过后自动获得称号" },
];

const stepStates = computed<StepState[]>(() => {
  switch (props.status) {
    case "processing":
      return ["complete", "current", "upcoming", "upcoming"];
    case "needs_review":
      return ["complete", "complete", "current", "upcoming"];
    case "completed":
      return ["complete", "complete", "complete", "complete"];
    case "rejected":
      if (props.resubmissionRequired) return ["complete", "failed", "upcoming", "upcoming"];
      return ["complete", "complete", "failed", "upcoming"];
    default:
      return ["current", "upcoming", "upcoming", "upcoming"];
  }
});

const stepDetails = computed(() => steps.map((step, index) => {
  const state = stepStates.value[index];
  if (step.key === "ocr" && state === "current" && props.status === "processing") return "平台正在处理截图";
  if (step.key === "ocr" && state === "failed") return "请重新提交截图";
  if (step.key === "review" && state === "current" && props.status === "needs_review") return "等待核对";
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
  if (props.status === undefined) return { ...step, state: "upcoming" as StepState, detail: step.intro, stateLabel: "", icon: step.icon };
  const state = stepStates.value[index] ?? "upcoming";
  const label = state === "failed" && props.resubmissionRequired ? "需重新提交" : stateLabel[state];
  return { ...step, state, detail: stepDetails.value[index] ?? step.detail, stateLabel: label, icon: stepIcon(step, state) };
}));
</script>

<template>
  <section class="progress-host" aria-labelledby="submission-progress-title">
    <h2 id="submission-progress-title" class="progress-heading">{{ status === undefined ? "获得称号流程" : "提交进度" }}</h2>
    <ol class="progress-list">
      <li v-for="(step, index) in progressItems" :key="step.key" class="progress-item" :class="`progress-item--${step.state}`">
        <div v-if="status === undefined" class="progress-marker num" aria-hidden="true">{{ index + 1 }}</div>
        <div v-else class="progress-marker" role="img" :aria-label="`${step.title}：${step.stateLabel}`"><UIcon :name="step.icon" aria-hidden="true" /></div>
        <div class="progress-copy"><div class="progress-title"><strong>{{ step.title }}</strong><span v-if="status !== undefined">{{ step.stateLabel }}</span></div><p>{{ step.detail }}</p></div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.progress-host { container-type: inline-size; display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.progress-heading { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.progress-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.progress-item { position: relative; display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: var(--space-3); min-height: 4.25rem; }
/* Connector: vertical by default, horizontal once the steps sit in a row. */
.progress-item:not(:last-child)::after { position: absolute; top: 2rem; bottom: 0; left: calc(1rem - 1px); width: 2px; background: var(--line); content: ""; }
.progress-item--complete:not(:last-child)::after { background: var(--accent); }
.progress-marker { position: relative; z-index: 1; display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid var(--line-strong); border-radius: 50%; color: var(--quiet); background: var(--surface-raised); font-size: .8rem; font-weight: 700; transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease; }
.progress-marker > svg { width: 1rem; height: 1rem; }
.progress-copy { min-width: 0; padding: var(--space-1) 0 var(--space-4); }
.progress-title { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.progress-title strong { color: var(--text); font-size: var(--type-label-sm-size); font-weight: 600; }
.progress-title span { color: var(--quiet); font-size: var(--type-caption-size); white-space: nowrap; }
.progress-copy p { margin: var(--space-1) 0 0; color: var(--muted); font-size: var(--type-caption-size); line-height: 1.5; }
.progress-item--complete .progress-marker { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent); background: var(--accent-surface); }
.progress-item--complete .progress-title span { color: var(--accent); }
.progress-item--current .progress-marker { border-color: var(--accent); color: var(--on-accent); background: var(--accent); box-shadow: 0 0 0 4px color-mix(in oklch, var(--accent) 22%, transparent); }
.progress-item--current .progress-title strong, .progress-item--current .progress-title span { color: var(--accent); }
.progress-item--failed .progress-marker { border-color: color-mix(in oklch, var(--warning) 58%, var(--line)); color: var(--warning); background: color-mix(in oklch, var(--warning) 12%, var(--surface)); }
.progress-item--failed .progress-title strong, .progress-item--failed .progress-title span { color: var(--warning); }
@container (min-width: 40rem) {
  .progress-list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
  .progress-item { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; gap: var(--space-3); min-height: 0; }
  .progress-item:not(:last-child)::after { top: calc(1rem - 1px); right: calc(-1 * var(--space-4)); bottom: auto; left: calc(2rem + var(--space-2)); width: auto; height: 2px; }
  .progress-item:not(:last-child)::after { right: calc(var(--space-2) - var(--space-4)); }
  .progress-copy { padding: 0; }
  .progress-title { flex-direction: column; gap: 2px; }
}
@media (prefers-contrast: more) { .progress-host, .progress-marker { border-color: var(--text); } }
</style>
