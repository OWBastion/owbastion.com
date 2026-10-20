<script setup lang="ts">
type Tone = "default" | "info" | "success" | "warning" | "error" | "accent";

// Maps the product's status tones onto UBadge; the look is set in app.config.ts.
const appearance: Record<Tone, { color: "neutral" | "info" | "success" | "warning" | "error" | "primary"; variant: "outline" | "subtle" }> = {
  default: { color: "neutral", variant: "outline" },
  info: { color: "info", variant: "subtle" },
  success: { color: "success", variant: "subtle" },
  warning: { color: "warning", variant: "subtle" },
  error: { color: "error", variant: "subtle" },
  accent: { color: "primary", variant: "subtle" },
};

const props = defineProps<{ label: string; tone?: Tone; icon?: string }>();
const look = computed(() => appearance[props.tone ?? "default"]);
</script>

<template>
  <UBadge :label="label" :color="look.color" :variant="look.variant">
    <template v-if="icon" #leading><span aria-hidden="true">{{ icon }}</span></template>
  </UBadge>
</template>
