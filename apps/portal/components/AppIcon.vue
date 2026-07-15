<script setup lang="ts">
const props = defineProps<{ name: "user" | "settings" | "logout" | "sun" | "moon" | "system" | "check" }>();
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="props.name === 'user'"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c.8-3 3-4.5 6.5-4.5s5.7 1.5 6.5 4.5" /></template>
    <template v-else-if="props.name === 'settings'"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" /><path d="m19.4 13.4 1.1.9-1.8 3.1-1.4-.5a7.2 7.2 0 0 1-1.6.9l-.3 1.5h-3.6l-.3-1.5a7.2 7.2 0 0 1-1.6-.9l-1.4.5-1.8-3.1 1.1-.9a7.1 7.1 0 0 1 0-1.8l-1.1-.9 1.8-3.1 1.4.5a7.2 7.2 0 0 1 1.6-.9l.3-1.5h3.6l.3 1.5a7.2 7.2 0 0 1 1.6.9l1.4-.5 1.8 3.1-1.1.9a7.1 7.1 0 0 1 0 1.8Z" /></template>
    <template v-else-if="props.name === 'logout'"><path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10" /><path d="M13 8l4 4-4 4M9 12h8" /></template>
    <template v-else-if="props.name === 'sun'"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></template>
    <template v-else-if="props.name === 'moon'"><path d="M19 15.2A7.5 7.5 0 0 1 8.8 5a7.7 7.7 0 1 0 10.2 10.2Z" /></template>
    <template v-else-if="props.name === 'system'"><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M9 20h6M12 16v4" /></template>
    <path v-else d="m5 12 4 4L19 6" />
  </svg>
</template>

<style scoped>
.app-icon { flex: 0 0 auto; width: 18px; height: 18px; }
</style>
