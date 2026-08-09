<script setup lang="ts">
definePageMeta({
  layout: "studio",
  middleware: ["auth", "studio-admin"],
});

useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });
</script>

<template>
  <main class="studio-workspace" aria-label="内容编辑器" />
</template>

<style scoped>
.studio-workspace {
  min-height: 100dvh;
}
</style>
