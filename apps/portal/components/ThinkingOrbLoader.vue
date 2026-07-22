<script setup lang="ts">
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThinkingOrb } from "thinking-orbs";

const props = withDefaults(defineProps<{
  label?: string;
  state?: "working" | "searching" | "solving" | "listening" | "composing" | "shaping";
}>(), {
  label: "读取中…",
  state: "working",
});

const host = ref<HTMLElement>();
let root: Root | undefined;

onMounted(() => {
  if (!host.value) return;

  root = createRoot(host.value);
  root.render(createElement(ThinkingOrb, {
    state: props.state,
    size: 64,
    "aria-label": props.label,
  }));
});

onBeforeUnmount(() => {
  root?.unmount();
});
</script>

<template>
  <div ref="host" class="thinking-orb-loader" role="status" :aria-label="label">
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.thinking-orb-loader { display: grid; min-height: 180px; place-items: center; gap: 12px; color: var(--muted); font-size: .82rem; }
.thinking-orb-loader :deep(canvas) { display: block; width: 64px; height: 64px; }
@media (prefers-reduced-motion: reduce) { .thinking-orb-loader :deep(canvas) { opacity: .78; } }
</style>
