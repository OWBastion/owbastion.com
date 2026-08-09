<script setup lang="ts">
definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const studioEntryUrl = "/api/studio/login?redirect=%2Fstudio";
</script>

<template>
  <AdminWorkspace title="内容编辑">
    <template #actions>
      <UButton to="/admin" color="neutral" variant="outline" label="返回管理概览" icon="i-lucide-arrow-left" />
      <UButton :to="studioEntryUrl" target="_blank" rel="noopener" label="打开内容编辑器" icon="i-lucide-file-pen-line" />
    </template>

    <section class="editor-entry surface-card" aria-label="内容编辑入口">
      <p class="body-copy">内容编辑器将在新标签页打开，当前管理页面会保持可用。</p>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.editor-entry {
  padding: clamp(1rem, 2vw, 1.5rem);
}

.editor-entry .body-copy {
  margin: 0;
}
</style>
