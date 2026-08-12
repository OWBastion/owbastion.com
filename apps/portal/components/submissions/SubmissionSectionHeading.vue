<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  headingId: string;
}>();
</script>

<template>
  <div class="section-heading">
    <div>
      <h2 :id="headingId">{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
  </div>
</template>

<style scoped>
.section-heading { margin-bottom: 18px; }
.section-heading h2 { margin: 0; color: var(--text); font-size: 1.1rem; letter-spacing: -.03em; }
.section-heading p:last-child { margin: 5px 0 0; color: var(--muted); font-size: .84rem; }
</style>
