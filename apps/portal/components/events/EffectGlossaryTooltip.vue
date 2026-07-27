<script setup lang="ts">
import { onBeforeUnmount, shallowRef } from "vue";
import type { EffectAnnotation } from "~/types/random-event";

const props = defineProps<{ annotation: EffectAnnotation }>();
const open = shallowRef(false);
let closeTimer: ReturnType<typeof setTimeout> | undefined;

const show = () => {
  if (closeTimer) clearTimeout(closeTimer);
  open.value = true;
};
const scheduleClose = () => {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { open.value = false; }, 150);
};
onBeforeUnmount(() => { if (closeTimer) clearTimeout(closeTimer); });
</script>

<template>
  <UPopover :open="open" :dismissible="false" :content="{ side: 'top', align: 'center', sideOffset: 8 }">
    <span class="effect-glossary-term" tabindex="0" @mouseenter="show" @mouseleave="scheduleClose" @focusin="show" @focusout="scheduleClose">
      <UBadge :label="props.annotation.term.nameZh" color="neutral" variant="subtle" />
    </span>
    <template #content>
      <div class="effect-glossary-tooltip" role="tooltip" @mouseenter="show" @mouseleave="scheduleClose">
        <strong>{{ props.annotation.term.nameZh }}</strong>
        <span>{{ props.annotation.term.summary }}</span>
        <span>{{ props.annotation.term.definition }}</span>
        <span v-if="props.annotation.term.rules.length" class="effect-glossary-rules">
          <span v-for="rule in props.annotation.term.rules" :key="rule">{{ rule }}</span>
        </span>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.effect-glossary-term { position: relative; display: inline-flex; cursor: help; }
.effect-glossary-tooltip { display: grid; width: min(320px, calc(100vw - 40px)); gap: 6px; padding: 12px 14px; color: var(--text); font-size: .78rem; line-height: 1.5; }
.effect-glossary-tooltip strong { font-size: .84rem; }.effect-glossary-tooltip > span:nth-child(2) { color: var(--quiet); }.effect-glossary-rules { display: grid; gap: 3px; padding-top: 4px; border-top: 1px solid var(--line); color: var(--quiet); }.effect-glossary-rules span::before { content: "• "; }
</style>
