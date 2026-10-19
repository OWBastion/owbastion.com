<script setup lang="ts">
defineProps<{ title: string; eyebrow: string; description?: string; titleId?: string }>();
</script>

<template>
  <header class="masthead">
    <div class="masthead__copy">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1 :id="titleId" class="masthead__title">{{ title }}</h1>
      <p v-if="description" class="masthead__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="masthead__meta"><slot /></div>
  </header>
</template>

<style scoped>
.masthead { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-5) var(--space-8); margin-bottom: var(--space-8); padding-bottom: var(--space-6); border-bottom: 1px solid var(--line); }
.masthead__copy { min-width: 0; max-width: 46rem; }
.masthead__title { margin: 0; font-family: var(--font-display); font-size: var(--type-title-size); font-weight: 700; letter-spacing: var(--type-title-tracking); line-height: var(--type-title-leading); }
.masthead__desc { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--type-body-size); line-height: 1.65; }
.masthead__meta { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@media (max-width: 47.99rem) {
  .masthead { margin-bottom: var(--space-5); padding-bottom: var(--space-5); }
}
</style>
