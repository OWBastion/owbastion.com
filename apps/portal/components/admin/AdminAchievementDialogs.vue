<script setup lang="ts">
import type { useAdminAchievementWorkspace } from "~/components/admin/useAdminAchievementWorkspace";

const props = defineProps<{ workspace: ReturnType<typeof useAdminAchievementWorkspace> }>();
const ws = props.workspace;
const iconFile = toRef(ws, "iconFile");
</script>

<template>
  <AdminAchievementEditorDialog
    v-model:open="ws.editorOpen.value"
    v-model:icon-file="iconFile"
    :item="ws.editingItem.value"
    :maps="ws.maps.value"
    :modes="ws.modes.value"
    :saving="ws.editingItem.value ? ws.isSaving(ws.editingItem.value) : false"
    :icon-uploading="ws.iconUploading.value"
    @save="ws.editingItem.value && ws.saveEditingItem(ws.editingItem.value)"
    @cancel="ws.closeEditing"
    @upload-icon="ws.uploadIcon"
    @update-catalog-lifecycle="ws.updateEditingCatalogLifecycle"
    @update-public-visibility="ws.updateEditingPublicVisibility"
  />

  <AdminResponsiveDialog :open="ws.endTarget.value !== null" :title="ws.endingCatalog.value ? '退休称号' : '结束挑战'" size="sm" :dismissible="!(ws.endTarget.value && ws.isSaving(ws.endTarget.value))" @update:open="(open) => { if (!open) ws.closeEnd(); }">
    <template #body>
      <form v-if="ws.endTarget.value" id="end-challenge-dialog" class="end-dialog" @submit.prevent="ws.endChallenge">
        <p>{{ ws.endingCatalog.value ? "退休后该称号不再发放。" : "结束后不再接受新的截图提交。" }}</p>
      </form>
    </template>
    <template #footer>
      <template v-if="ws.endTarget.value">
        <UButton :label="ws.endingCatalog.value ? '确认退休' : '结束挑战'" color="error" variant="soft" type="submit" form="end-challenge-dialog" :loading="ws.isSaving(ws.endTarget.value)" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="ws.isSaving(ws.endTarget.value)" @click="ws.closeEnd" />
      </template>
    </template>
  </AdminResponsiveDialog>

  <AdminAchievementCreateDialog v-model:open="ws.createOpen.value" :maps="ws.maps.value" :modes="ws.modes.value" :saving="ws.creating.value" @submit="ws.createAchievement" />
</template>

<style scoped>
.end-dialog p { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
</style>
