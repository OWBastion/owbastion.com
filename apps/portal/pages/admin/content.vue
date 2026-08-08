<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const route = useRoute();
const studioLoginUrl = "/api/studio/login?redirect=%2Fadmin%2Fcontent%3Fstudio%3Dopen";

type StudioHost = {
  ui?: { expandSidebar?: () => void; collapseSidebar?: () => void };
  on?: { mounted?: (fn: () => void) => void };
};
const studioHost = () => (window as Window & { useStudioHost?: () => StudioHost }).useStudioHost?.();

const isEditorOpen = ref(false);
let editorStateObserver: MutationObserver | undefined;
let hostReadyObserver: MutationObserver | undefined;

const syncEditorState = () => {
  isEditorOpen.value = document.body.hasAttribute("data-expand-sidebar");
};

const expandEditor = () => studioHost()?.ui?.expandSidebar?.();
const collapseEditor = () => studioHost()?.ui?.collapseSidebar?.();

/** Open the editor in place when a Studio session exists; otherwise log in first. */
const openStudio = () => {
  if (studioHost()?.ui?.expandSidebar) {
    expandEditor();
    return;
  }
  window.location.assign(studioLoginUrl);
};

/** Toggle the editor; falls back to the login round-trip when no session exists. */
const toggleEditor = () => {
  if (!studioHost()?.ui?.collapseSidebar) {
    openStudio();
    return;
  }
  if (document.body.hasAttribute("data-expand-sidebar")) {
    collapseEditor();
  } else {
    expandEditor();
  }
};

/** Expand once the Studio host is ready; event-driven, no polling timer. */
function expandWhenReady() {
  const host = studioHost();
  if (!host?.ui?.expandSidebar) return false;
  if (host.on?.mounted) {
    host.on.mounted(() => host.ui?.expandSidebar?.());
  } else {
    host.ui.expandSidebar();
  }
  return true;
}

onMounted(() => {
  syncEditorState();
  editorStateObserver = new MutationObserver(syncEditorState);
  editorStateObserver.observe(document.body, { attributes: true, attributeFilter: ["data-expand-sidebar"] });

  if (route.query.studio !== "open") return;
  // The login round-trip returns to /admin/content?studio=open; the Studio host
  // activates asynchronously, so expand once its <nuxt-studio> element appears.
  if (expandWhenReady()) return;
  hostReadyObserver = new MutationObserver(() => {
    if (expandWhenReady()) hostReadyObserver?.disconnect();
  });
  hostReadyObserver.observe(document.body, { childList: true });
});

onBeforeUnmount(() => {
  hostReadyObserver?.disconnect();
  editorStateObserver?.disconnect();
  // Close the editor sidebar when leaving the content page.
  collapseEditor();
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
      <UButton @click="toggleEditor" :label="isEditorOpen ? '收起编辑器' : '打开内容编辑器'" :icon="isEditorOpen ? 'i-lucide-panel-left-close' : 'i-lucide-file-pen-line'" size="lg" />
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
