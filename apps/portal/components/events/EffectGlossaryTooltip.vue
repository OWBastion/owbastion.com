<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import type { EffectAnnotation } from "~/types/random-event";

const props = defineProps<{ annotation: EffectAnnotation }>();
const open = shallowRef(false);
const tooltipId = computed(() => `effect-glossary-${props.annotation.term.key}`);
const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");

function stopCardActivation(event: Event) {
  event.stopPropagation();
}

function showForPointer() {
  if (!finePointer.value) return;
  open.value = true;
}

function hideForPointer() {
  if (!finePointer.value) return;
  open.value = false;
}
</script>

<template>
  <span class="effect-glossary-wrap" @click="stopCardActivation" @pointerdown="stopCardActivation">
    <UPopover
      v-model:open="open"
      :dismissible="true"
      :content="{ side: 'top', align: 'center', sideOffset: 8, collisionPadding: 12 }"
    >
      <button
        type="button"
        class="effect-glossary-term pressable-soft"
        :aria-expanded="open"
        :aria-controls="open ? tooltipId : undefined"
        :aria-label="`${props.annotation.term.nameZh}，效果说明`"
        @mouseenter="showForPointer"
        @mouseleave="hideForPointer"
      >
        <UBadge :label="props.annotation.term.nameZh" color="neutral" variant="subtle" />
      </button>
      <template #content>
        <div :id="tooltipId" class="effect-glossary-tooltip" role="tooltip">
          <strong>{{ props.annotation.term.nameZh }}</strong>
          <span>{{ props.annotation.term.summary }}</span>
          <span>{{ props.annotation.term.definition }}</span>
          <span v-if="props.annotation.term.rules.length" class="effect-glossary-rules">
            <span v-for="rule in props.annotation.term.rules" :key="rule">{{ rule }}</span>
          </span>
        </div>
      </template>
    </UPopover>
  </span>
</template>

<style scoped>
.effect-glossary-wrap { display: inline-flex; }
.effect-glossary-term {
  position: relative;
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: help;
  font: inherit;
}
.effect-glossary-tooltip {
  display: grid;
  width: min(20rem, calc(100vw - 2.5rem));
  gap: 0.375rem;
  padding: 0.75rem 0.875rem;
  color: var(--text);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.effect-glossary-tooltip strong { font-size: 0.84rem; }
.effect-glossary-tooltip > span:nth-child(2) { color: var(--quiet); }
.effect-glossary-rules {
  display: grid;
  gap: 0.1875rem;
  padding-top: 0.25rem;
  border-top: 1px solid var(--line);
  color: var(--quiet);
}
.effect-glossary-rules span::before { content: "• "; }
</style>
