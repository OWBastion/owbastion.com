<script setup lang="ts">
import { computed } from "vue";
import { useStudioEditorWorkspace } from "~/composables/useStudioEditorWorkspace";

definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const { status, errorMessage, isEditorOpen, start } = useStudioEditorWorkspace();

const statusTitle = computed(() => {
  if (status.value === "loading") return "正在载入内容编辑器";
  if (status.value === "error") return "内容编辑器无法载入";
  if (isEditorOpen.value) return "内容编辑器已打开";
  return "内容编辑器未打开";
});

const statusDescription = computed(() => {
  if (status.value === "loading") return "正在准备当前管理员会话和内容工作区。";
  if (status.value === "error") return errorMessage.value;
  if (isEditorOpen.value) return "编辑器已接管当前窗口；关闭编辑器后可以返回管理后台。";
  return "进入此页面会直接打开内容编辑器。";
});
</script>

<template>
  <AdminWorkspace title="内容编辑">
    <template #actions>
      <UButton to="/admin" color="neutral" variant="outline" label="返回管理概览" icon="i-lucide-arrow-left" />
    </template>

    <section
      class="editor-state surface-card"
      :aria-busy="status === 'loading'"
      :aria-labelledby="status === 'error' ? 'studio-editor-error-title' : 'studio-editor-state-title'"
    >
      <div>
        <p class="eyebrow">内容工作区</p>
        <h2 :id="status === 'error' ? 'studio-editor-error-title' : 'studio-editor-state-title'">{{ statusTitle }}</h2>
        <p v-if="status === 'error'" class="body-copy" role="alert">{{ statusDescription }}</p>
        <p v-else class="body-copy" role="status" aria-live="polite">{{ statusDescription }}</p>
      </div>

      <UButton
        v-if="status === 'closed' || status === 'error'"
        :label="status === 'error' ? '重新载入编辑器' : '打开内容编辑器'"
        :icon="status === 'error' ? 'i-lucide-refresh-cw' : 'i-lucide-file-pen-line'"
        size="lg"
        @click="start"
      />
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.editor-state {
  display: grid;
  align-content: center;
  gap: 1.5rem;
  min-height: min(52vh, 34rem);
  padding: clamp(1.5rem, 4vw, 3rem);
}

.editor-state h2 {
  margin: 0;
  max-width: 24ch;
}

.editor-state .body-copy {
  max-width: 52ch;
  margin: 0.75rem 0 0;
}

@media (max-width: 620px) {
  .editor-state {
    min-height: min(58vh, 30rem);
    padding: 1.25rem;
  }

  .editor-state :deep(button) {
    width: 100%;
    justify-content: center;
  }
}
</style>
