<script setup lang="ts">
// The one toggle used for combinable filters on player and admin directories, so they read the same everywhere.
defineProps<{ label: string; count?: number; pressed: boolean; disabled?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <UButton :label="label" size="md" :color="pressed ? 'primary' : 'neutral'" :variant="pressed ? 'soft' : 'outline'" :aria-pressed="pressed" :disabled="disabled" @click="$emit('toggle')">
    <template v-if="count !== undefined" #trailing><span class="filter-chip__count num">{{ count }}</span></template>
  </UButton>
</template>

<style scoped>
.filter-chip__count { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
</style>
