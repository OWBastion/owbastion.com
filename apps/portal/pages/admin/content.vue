<script setup lang="ts">
import { computed, ref } from "vue";
import { useStudioEditorWorkspace } from "~/composables/useStudioEditorWorkspace";

definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const studioMount = ref<HTMLElement | null>(null);
const { status, errorMessage, isEditorOpen, start, close } = useStudioEditorWorkspace(studioMount);

const statusTitle = computed(() => {
  if (status.value === "loading") return "正在载入内容编辑器";
  if (status.value === "error") return "内容编辑器无法载入";
  if (isEditorOpen.value) return "内容编辑器已打开";
  return "内容编辑器未打开";
});

const statusDescription = computed(() => {
  if (status.value === "loading") return "正在准备当前管理员会话和内容工作区。";
  if (status.value === "error") return errorMessage.value;
  if (isEditorOpen.value) return "在当前管理工作区内编辑内容；保存后通过版本更新入口发布。";
  return "选择内容文件后在此处编辑，不离开管理侧。";
});
</script>

<template>
  <AdminWorkspace title="内容编辑">
    <template #actions>
      <UButton to="/admin" color="neutral" variant="outline" label="返回管理概览" icon="i-lucide-arrow-left" />
    </template>

    <section class="editor-workspace surface-card" :aria-busy="status === 'loading'" aria-labelledby="studio-editor-state-title">
      <header class="editor-toolbar">
        <div>
          <p class="eyebrow">内容工作区</p>
          <h2 id="studio-editor-state-title">{{ statusTitle }}</h2>
          <p v-if="status === 'error'" class="body-copy" role="alert">{{ statusDescription }}</p>
          <p v-else class="body-copy" role="status" aria-live="polite">{{ statusDescription }}</p>
        </div>

        <div class="editor-actions">
          <UButton v-if="isEditorOpen" label="关闭编辑器" icon="i-lucide-x" color="neutral" variant="outline" @click="close" />
          <UButton v-else-if="status === 'closed' || status === 'error'" :label="status === 'error' ? '重新载入编辑器' : '打开内容编辑器'" :icon="status === 'error' ? 'i-lucide-refresh-cw' : 'i-lucide-file-pen-line'" @click="start" />
        </div>
      </header>

      <div ref="studioMount" class="studio-editor-frame" aria-label="内容编辑器"></div>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.editor-workspace {
  display: grid;
  gap: 1.25rem;
  padding: clamp(1rem, 2vw, 1.5rem);
}

.editor-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.editor-toolbar h2 {
  margin: 0;
  max-width: 32ch;
}

.editor-toolbar .body-copy {
  max-width: 64ch;
  margin: 0.75rem 0 0;
}

.editor-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;
}

.studio-editor-frame {
  min-height: 34rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

@media (max-width: 620px) {
  .editor-toolbar {
    display: grid;
  }

  .editor-actions,
  .editor-actions :deep(button) {
    width: 100%;
  }

  .editor-actions :deep(button) {
    justify-content: center;
  }

  .studio-editor-frame {
    min-height: 28rem;
  }
}
</style>
