<script setup lang="ts">
import { useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";

type DialogSize = "sm" | "md" | "lg" | "xl";

withDefaults(defineProps<{
  title: string;
  description?: string;
  size?: DialogSize;
  dismissible?: boolean;
}>(), {
  description: undefined,
  size: "md",
  dismissible: true,
});

const open = defineModel<boolean>("open", { required: true });
const isDesktop = useMediaQuery("(min-width: 768px)");
const reducedMotion = usePreferredReducedMotion();
const sizeClasses: Record<DialogSize, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};
</script>

<template>
  <UModal
    v-if="isDesktop"
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    close
    :transition="reducedMotion !== 'reduce'"
    scrollable
    :ui="{ content: `admin-responsive-dialog__content admin-responsive-dialog__modal w-[calc(100vw-2rem)] ${sizeClasses[size]} max-h-[calc(100dvh-2rem)]`, header: 'admin-responsive-dialog__header', body: 'admin-responsive-dialog__body', footer: 'admin-responsive-dialog__footer' }"
  >
    <template #body><slot name="body" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </UModal>

  <UDrawer
    v-else
    v-model:open="open"
    direction="bottom"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    close
    should-scale-background
    set-background-color-on-scale
    :ui="{ content: 'admin-responsive-dialog__content admin-responsive-dialog__drawer max-h-[calc(100dvh-1rem)]', header: 'admin-responsive-dialog__header', body: 'admin-responsive-dialog__body pb-[max(1rem,env(safe-area-inset-bottom))]', footer: 'admin-responsive-dialog__footer' }"
  >
    <template #body><slot name="body" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </UDrawer>
</template>

<style>
.admin-responsive-dialog__content {
  border: 1px solid color-mix(in oklch, var(--line-strong) 78%, transparent);
  background: color-mix(in oklch, var(--surface) 88%, transparent);
  box-shadow: 0 24px 80px color-mix(in oklch, var(--shadow) 86%, transparent), 0 1px 0 color-mix(in oklch, white 45%, transparent) inset;
  backdrop-filter: blur(22px) saturate(1.18);
}
.admin-responsive-dialog__modal { border-radius: 20px; }
.admin-responsive-dialog__drawer { border-bottom: 0; border-radius: 20px 20px 0 0; }
.admin-responsive-dialog__header, .admin-responsive-dialog__footer {
  background: color-mix(in oklch, var(--surface) 82%, transparent);
  backdrop-filter: blur(18px) saturate(1.12);
}
.admin-responsive-dialog__footer { border-top: 1px solid color-mix(in oklch, var(--line) 78%, transparent); }
.admin-responsive-dialog__body { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
@media (prefers-reduced-motion: reduce) { .admin-responsive-dialog__content { transition-duration: 1ms !important; } }
@media (prefers-reduced-transparency: reduce) {
  .admin-responsive-dialog__content, .admin-responsive-dialog__header, .admin-responsive-dialog__footer { background: var(--surface); backdrop-filter: none; }
}
@media (prefers-contrast: more) { .admin-responsive-dialog__content { border-color: var(--line-strong); } }
</style>
