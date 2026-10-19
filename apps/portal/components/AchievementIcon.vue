<script setup lang="ts">
defineProps<{ url?: string | null; icon: string; earned: boolean }>();
</script>

<template>
  <span class="achievement-icon" :class="{ 'is-earned': earned }" aria-hidden="true">
    <img v-if="url" :src="url" alt="" />
    <UIcon v-else :name="`i-lucide-${icon}`" />
  </span>
</template>

<style scoped>
.achievement-icon { --size: var(--achievement-icon-size, 4rem); display: grid; width: var(--size); height: var(--size); place-items: center; color: var(--quiet); font-size: calc(var(--size) * .44); clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: var(--surface-raised); filter: grayscale(1); opacity: .5; }
.achievement-icon img { width: 62%; height: 62%; object-fit: contain; }
.achievement-icon.is-earned { color: var(--accent); background: radial-gradient(circle at 50% 35%, color-mix(in oklch, var(--accent) 45%, transparent), transparent 75%), var(--accent-surface); filter: none; opacity: 1; }
</style>
