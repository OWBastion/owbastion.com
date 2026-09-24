<script setup lang="ts">
defineProps<{
  title: string;
  eyebrow?: string;
  count?: string;
  headingLevel?: "h2" | "h3";
  headingId?: string;
}>();
</script>

<template>
  <header class="section-header">
    <div class="section-header__row">
      <div>
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <component :is="headingLevel ?? 'h2'" :id="headingId" class="section-header__title">{{ title }}</component>
      </div>
      <div v-if="count || $slots.actions" class="section-header__meta"><slot name="actions" /><span v-if="count">{{ count }}</span></div>
    </div>
  </header>
</template>

<style scoped>
/* container-type lives on the header so the row below can query the
   header's own width; a size container cannot query itself. */
.section-header { container-type: inline-size; margin-bottom: var(--space-4); }
.section-header__row { display: flex; align-items: end; justify-content: space-between; gap: var(--space-4); }
.section-header .eyebrow { margin-bottom: var(--space-1); }
.section-header__title { margin: 0; font-size: var(--type-headline-size); font-weight: 600; letter-spacing: var(--type-headline-tracking); line-height: var(--type-headline-leading); }
.section-header__meta { display: flex; align-items: center; gap: var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; white-space: nowrap; }
@container (max-width: 23.99rem) { .section-header__row { align-items: flex-start; flex-direction: column; gap: var(--space-2); } }
</style>
