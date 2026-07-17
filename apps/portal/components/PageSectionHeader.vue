<script setup lang="ts">
defineProps<{
  title: string;
  eyebrow?: string;
  count?: string;
  headingLevel?: "h2" | "h3";
}>();
</script>

<template>
  <header class="section-header">
    <div>
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <component :is="headingLevel ?? 'h2'" class="section-header__title">{{ title }}</component>
    </div>
    <div v-if="count || $slots.actions" class="section-header__meta"><slot name="actions" /><span v-if="count">{{ count }}</span></div>
  </header>
</template>

<style scoped>
.section-header { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.section-header .eyebrow { margin-bottom: 5px; }
.section-header__title { margin: 0; font-size: clamp(1.3rem, 3vw, 2.1rem); letter-spacing: -.04em; }
.section-header__meta { display: flex; align-items: center; gap: 12px; color: var(--quiet); font-size: .78rem; white-space: nowrap; }
@media (max-width: 620px) { .section-header { align-items: flex-start; flex-direction: column; gap: 10px; } }
</style>
