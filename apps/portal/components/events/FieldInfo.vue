<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";

const props = defineProps<{ label: string; text: string }>();
const open = shallowRef(false);
const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
const tipId = useId();

function hover(value: boolean) {
  if (finePointer.value) open.value = value;
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'top', align: 'center', sideOffset: 6, collisionPadding: 12 }">
    <button
      type="button"
      class="field-info pressable-soft"
      :aria-label="`${props.label}说明`"
      :aria-expanded="open"
      :aria-controls="open ? tipId : undefined"
      @mouseenter="hover(true)"
      @mouseleave="hover(false)"
    >
      <UIcon name="i-lucide-info" class="field-info__icon" />
    </button>
    <template #content>
      <p :id="tipId" class="field-info__tip" role="tooltip">{{ props.text }}</p>
    </template>
  </UPopover>
</template>

<style scoped>
.field-info {
  position: relative;
  display: inline-flex;
  min-height: 0;
  min-width: 0;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--quiet);
  cursor: help;
  vertical-align: middle;
}
/* Keep a 44px touch target without inflating the visible icon. */
.field-info::after { content: ""; position: absolute; inset: 50% auto auto 50%; width: 2.75rem; height: 2.75rem; transform: translate(-50%, -50%); }
.field-info__icon { width: 0.875rem; height: 0.875rem; }
.field-info__tip { width: min(18rem, calc(100vw - 2.5rem)); margin: 0; padding: 0.625rem 0.75rem; color: var(--text); font-size: var(--type-caption-size); line-height: 1.5; }
</style>
