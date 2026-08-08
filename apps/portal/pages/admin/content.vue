<script setup lang="ts">
import { computed, ref } from "vue";
import { useStudioEditorWorkspace } from "~/composables/useStudioEditorWorkspace";

definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const studioMount = ref<HTMLElement | null>(null);
const { status, errorMessage, isEditorOpen, start, close } = useStudioEditorWorkspace(studioMount);

const statusDescription = computed(() => {
  if (status.value === "loading") return "正在载入内容编辑器…";
  if (status.value === "error") return errorMessage.value;
  if (isEditorOpen.value) return "编辑器已打开，在当前管理工作区内编辑内容；保存后通过版本更新入口发布。";
  return "编辑器未打开，打开后可在此编辑，不离开管理侧。";
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
          <h2 id="studio-editor-state-title" class="type-headline">内容工作区</h2>
          <p v-if="status === 'error'" class="body-copy" role="alert">{{ statusDescription }}</p>
          <p v-else class="body-copy" role="status" aria-live="polite">{{ statusDescription }}</p>
        </div>

        <div class="editor-actions">
          <UButton v-if="isEditorOpen" label="关闭编辑器" icon="i-lucide-x" color="neutral" variant="outline" @click="close" />
          <UButton v-else-if="status === 'closed' || status === 'error'" :label="status === 'error' ? '重新载入编辑器' : '打开内容编辑器'" :icon="status === 'error' ? 'i-lucide-refresh-cw' : 'i-lucide-file-pen-line'" @click="start" />
        </div>
      </header>

      <div ref="studioMount" class="studio-editor-frame" :class="{ 'studio-editor-frame--active': isEditorOpen }" role="region" aria-label="内容编辑器"></div>
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
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

/* Bounded editing viewport: the embedded editor grows with its current content
   and scrolls internally only after reaching the viewport cap. */
.studio-editor-frame--active {
  height: auto;
  max-height: clamp(26rem, 62dvh, 40rem);
  overflow-y: auto;
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

  .studio-editor-frame--active {
    max-height: clamp(26rem, 68dvh, 42rem);
  }
}
</style>
