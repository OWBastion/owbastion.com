<script setup lang="ts">
import { ref } from "vue";
import { useStudioEditorWorkspace } from "~/composables/useStudioEditorWorkspace";

definePageMeta({ middleware: ["auth", "studio-admin"] });
useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });

const studioMount = ref<HTMLElement | null>(null);
const { status, errorMessage, isEditorOpen, start, close } = useStudioEditorWorkspace(studioMount);
</script>

<template>
  <AdminWorkspace title="内容编辑">
    <template #actions>
      <UButton to="/admin" color="neutral" variant="outline" label="返回管理概览" icon="i-lucide-arrow-left" />
      <UButton v-if="isEditorOpen" label="关闭编辑器" icon="i-lucide-x" color="neutral" variant="outline" @click="close" />
      <UButton v-else-if="status === 'closed'" label="打开内容编辑器" icon="i-lucide-file-pen-line" @click="start" />
    </template>

    <section class="editor-workspace surface-card" :aria-busy="status === 'loading'" aria-label="内容编辑器">
      <div v-if="status === 'loading'" class="editor-loading" role="status">正在载入内容编辑器…</div>
      <UAlert v-else-if="status === 'error'" color="error" variant="subtle" role="alert" :description="errorMessage">
        <template #actions>
          <UButton label="重新载入编辑器" icon="i-lucide-refresh-cw" color="neutral" variant="outline" @click="start" />
        </template>
      </UAlert>
      <UEmpty v-else-if="status === 'closed'" title="编辑器已关闭" variant="naked" />
      <div ref="studioMount" class="studio-editor-frame" :class="{ 'studio-editor-frame--active': isEditorOpen }"></div>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.editor-workspace {
  display: grid;
  gap: 1.25rem;
  padding: clamp(1rem, 2vw, 1.5rem);
}

.editor-loading {
  min-height: 170px;
  display: grid;
  place-items: center;
  color: var(--muted);
}

.studio-editor-frame {
  min-height: 0;
  overflow: hidden;
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

/* Bounded editing viewport: the embedded editor grows with its current content
   and scrolls internally only after reaching the viewport cap. */
.studio-editor-frame--active {
  height: auto;
  max-height: clamp(26rem, 62dvh, 40rem);
  overflow-y: auto;
  border: 1px solid var(--line);
}

@media (max-width: 620px) {
  .editor-workspace {
    padding: 1rem;
  }

  .studio-editor-frame--active {
    max-height: clamp(26rem, 68dvh, 42rem);
  }
}
</style>
