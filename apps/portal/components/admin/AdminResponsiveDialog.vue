<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";

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
    scrollable
    :ui="{ content: `w-[calc(100vw-2rem)] ${sizeClasses[size]} max-h-[calc(100dvh-2rem)]`, body: 'overflow-y-auto' }"
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
    :ui="{ content: 'max-h-[calc(100dvh-1rem)]', body: 'overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]' }"
  >
    <template #body><slot name="body" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </UDrawer>
</template>
