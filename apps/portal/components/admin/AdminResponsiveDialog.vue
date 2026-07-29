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
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
const reducedMotion = usePreferredReducedMotion();
const sizeClasses: Record<DialogSize, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

onMounted(() => { hydrated.value = true; });
</script>

<template>
  <template v-if="hydrated">
    <UModal
      v-if="isDesktop"
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    close
    :transition="reducedMotion !== 'reduce'"
    scrollable
    :ui="{ content: `admin-responsive-dialog__content admin-responsive-dialog__modal glass-heavy elevation-3 w-[calc(100vw-2rem)] ${sizeClasses[size]} max-h-[calc(100dvh-2rem)]`, header: 'admin-responsive-dialog__header glass-segment', body: 'admin-responsive-dialog__body', footer: 'admin-responsive-dialog__footer glass-segment' }"
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
    :ui="{ content: 'admin-responsive-dialog__content admin-responsive-dialog__drawer glass-heavy elevation-3 max-h-[calc(100dvh-1rem)]', header: 'admin-responsive-dialog__header glass-segment', body: 'admin-responsive-dialog__body pb-[max(1rem,env(safe-area-inset-bottom))]', footer: 'admin-responsive-dialog__footer glass-segment' }"
  >
    <template #body><slot name="body" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
    </UDrawer>
  </template>
</template>

<style>
.admin-responsive-dialog__content {
  border: 1px solid color-mix(in oklch, var(--line-strong) 78%, transparent);
}
.admin-responsive-dialog__modal { border-radius: 20px; overflow: hidden; }
.admin-responsive-dialog__drawer { border-bottom: 0; border-radius: 20px 20px 0 0; overflow: hidden; }
/* Header/footer are solid segments on glass — no second backdrop blur (A-01). */
.admin-responsive-dialog__footer {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid color-mix(in oklch, var(--line) 78%, transparent);
}
.admin-responsive-dialog__body {
  min-height: 0;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
@media (prefers-reduced-motion: reduce) {
  .admin-responsive-dialog__content { transition-duration: 1ms !important; }
}
</style>
