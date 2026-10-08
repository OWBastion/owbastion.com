<script setup lang="ts">
const route = useRoute();
const items = [
  { label: "称号目录", to: "/admin/achievements/titles" },
  { label: "通用挑战", to: "/admin/achievements/challenges" },
  { label: "地图挑战", to: "/admin/achievements/map-challenges" },
];
</script>

<template>
  <nav class="achievement-nav" aria-label="挑战与称号">
    <NuxtLink v-for="item in items" :key="item.to" :to="item.to" :aria-current="route.path === item.to ? 'page' : undefined" :class="{ active: route.path === item.to }">{{ item.label }}</NuxtLink>
  </nav>
</template>

<style scoped>
.achievement-nav { display: flex; gap: var(--space-4); border-bottom: 1px solid var(--line); }
.achievement-nav a { padding: var(--space-2) 0; color: var(--quiet); font-weight: 600; border-bottom: 2px solid transparent; text-decoration: none; }
.achievement-nav a.active { color: var(--text); border-bottom-color: currentColor; }
</style>
