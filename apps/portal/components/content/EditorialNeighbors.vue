<script setup lang="ts">
export type EditorialNeighbor = { path: string; title: string; label: string };
defineProps<{ older: EditorialNeighbor | null; newer: EditorialNeighbor | null }>();
</script>

<template>
  <nav v-if="older || newer" class="editorial-neighbors" aria-label="上一篇和下一篇">
    <NuxtLink v-if="older" :to="older.path" class="editorial-neighbor surface-card interactive-card pressable-soft">
      <span class="editorial-neighbor__label type-label-sm"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />{{ older.label }}</span>
      <strong class="editorial-neighbor__title">{{ older.title }}</strong>
    </NuxtLink>
    <NuxtLink v-if="newer" :to="newer.path" class="editorial-neighbor editorial-neighbor--next surface-card interactive-card pressable-soft">
      <span class="editorial-neighbor__label type-label-sm">{{ newer.label }}<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></span>
      <strong class="editorial-neighbor__title">{{ newer.title }}</strong>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.editorial-neighbors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.editorial-neighbor { display: grid; gap: var(--space-1); min-width: 0; padding: var(--space-4); color: inherit; text-decoration: none; }
.editorial-neighbor--next { text-align: right; grid-column: 2; }
.editorial-neighbor__label { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--quiet); }
.editorial-neighbor--next .editorial-neighbor__label { justify-content: flex-end; }
.editorial-neighbor__title { font-size: var(--type-card-title-size); font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
@container (max-width: 47.99rem) {
  .editorial-neighbors { grid-template-columns: minmax(0, 1fr); }
  .editorial-neighbor--next { grid-column: auto; }
}
</style>
