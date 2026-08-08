<script setup lang="ts">
definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const studioLoginUrl = "/api/studio/login?redirect=%2Fadmin%2Fcontent";

const openStudio = () => {
  window.location.assign(studioLoginUrl);
};
</script>

<template>
  <AdminWorkspace title="内容编辑">
    <section class="studio-launch surface-card" aria-labelledby="studio-launch-title">
      <div>
        <p class="eyebrow">Nuxt Studio</p>
        <h2 id="studio-launch-title" class="type-headline">编辑 Portal 内容</h2>
        <p class="body-copy">使用当前平台管理员会话进入内容编辑器。编辑器保持在 Portal 同源页面；平台退出或管理员权限失效后，Studio 请求会立即被拒绝。</p>
      </div>
      <UButton @click="openStudio" label="打开内容编辑器" icon="i-lucide-file-pen-line" size="lg" />
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.studio-launch { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; padding: clamp(1.25rem, 3vw, 2rem); }
.studio-launch h2 { margin: 0; }
.studio-launch .body-copy { max-width: 58ch; margin: .75rem 0 0; }
@media (max-width: 620px) {
  .studio-launch { align-items: stretch; flex-direction: column; gap: 1.25rem; }
  .studio-launch :deep(button) { width: 100%; justify-content: center; }
}
</style>
