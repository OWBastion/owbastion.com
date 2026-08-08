<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const studioLoginUrl = "/api/studio/login?redirect=%2Fadmin%2Fcontent";
let studioExpandTimer: ReturnType<typeof setInterval> | undefined;

const openStudio = () => {
  const studioElement = document.querySelector("nuxt-studio");
  const studioControl = studioElement?.shadowRoot?.querySelector<HTMLButtonElement>(".fixed.bottom-2.left-2 button");
  if (studioControl) {
    studioControl.click();
    return;
  }
  window.location.assign(studioLoginUrl);
};

onMounted(() => {
  const showStudioSidebar = () => {
    const studioElement = document.querySelector("nuxt-studio");
    const sidebar = studioElement?.shadowRoot?.querySelector<HTMLElement>(".fixed.top-0.bottom-0.left-0");
    sidebar?.style.setProperty("z-index", "50", "important");
  };

  let attempts = 0;
  const tryExpandStudio = () => {
    const studioWindow = window as Window & {
      useStudioHost?: () => { ui?: { activateStudio?: () => void; expandSidebar?: () => void } };
    };
    const host = studioWindow.useStudioHost?.();
    const studioElement = document.querySelector("nuxt-studio");
    if (host?.ui?.expandSidebar && studioElement) {
      host.ui.activateStudio?.();
      if (!document.body.hasAttribute("data-studio-auto-expanded")) {
        host.ui.expandSidebar();
        document.body.setAttribute("data-studio-auto-expanded", "true");
      }
      showStudioSidebar();
      if (studioExpandTimer) clearInterval(studioExpandTimer);
      studioExpandTimer = undefined;
      return;
    }
    attempts += 1;
    if (attempts >= 100 && studioExpandTimer) {
      clearInterval(studioExpandTimer);
      studioExpandTimer = undefined;
    }
  };

  tryExpandStudio();
  studioExpandTimer = setInterval(tryExpandStudio, 100);
});

onBeforeUnmount(() => {
  if (studioExpandTimer) clearInterval(studioExpandTimer);
});
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
