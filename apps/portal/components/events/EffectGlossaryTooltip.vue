<script setup lang="ts">
import type { EffectAnnotation } from "~/types/random-event";

defineProps<{ annotation: EffectAnnotation }>();
</script>

<template>
  <span class="effect-glossary-term" tabindex="0">
    <UBadge :label="annotation.term.nameZh" color="neutral" variant="subtle" />
    <span class="effect-glossary-tooltip" role="tooltip">
      <strong>{{ annotation.term.nameZh }}</strong>
      <span>{{ annotation.term.summary }}</span>
      <span>{{ annotation.term.definition }}</span>
      <span v-if="annotation.term.rules.length" class="effect-glossary-rules">
        <span v-for="rule in annotation.term.rules" :key="rule">{{ rule }}</span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.effect-glossary-term { position: relative; display: inline-flex; cursor: help; }
.effect-glossary-tooltip { position: absolute; z-index: 20; bottom: calc(100% + 8px); left: 50%; display: grid; width: min(320px, calc(100vw - 40px)); gap: 6px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 10px; color: var(--text); background: var(--surface-raised); box-shadow: 0 14px 30px -18px var(--shadow); font-size: .78rem; line-height: 1.5; opacity: 0; pointer-events: none; transform: translate(-50%, 4px); transition: opacity 140ms ease, transform 140ms ease; }
.effect-glossary-term:hover .effect-glossary-tooltip, .effect-glossary-term:focus .effect-glossary-tooltip { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
.effect-glossary-tooltip strong { font-size: .84rem; }.effect-glossary-tooltip > span:nth-child(2) { color: var(--quiet); }.effect-glossary-rules { display: grid; gap: 3px; padding-top: 4px; border-top: 1px solid var(--line); color: var(--quiet); }.effect-glossary-rules span::before { content: "• "; }
</style>
