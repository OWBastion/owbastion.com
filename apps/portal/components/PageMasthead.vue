<script setup lang="ts">
defineProps<{ title: string; titleId?: string }>();
</script>

<template>
  <h1 :id="titleId" class="masthead">{{ title }}</h1>
</template>

<style scoped>
.masthead { margin: 0 0 var(--space-8); font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
</style>
