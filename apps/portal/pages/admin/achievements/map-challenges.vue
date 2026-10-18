<script setup lang="ts">
import { useAdminAchievementWorkspace } from "~/components/admin/useAdminAchievementWorkspace";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "地图挑战 · 躲避堡垒 3" });

const route = useRoute();
const workspace = useAdminAchievementWorkspace();
const { maps, mapItems, loading, errorMessage, toggleEditing } = workspace;
</script>

<template>
  <AdminWorkspace title="地图挑战">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <AdminAchievementNav />
    <AdminMapAchievementWorkspace :maps="maps" :challenges="mapItems" :loading="loading" :initial-map-id="typeof route.query.mapId === 'string' ? route.query.mapId : ''" :initial-rule-id="typeof route.query.ruleId === 'string' ? route.query.ruleId : ''" @edit-challenge="(challenge) => toggleEditing(challenge)" />
    <AdminAchievementEditorDialog
      v-model:open="workspace.editorOpen.value"
      :item="workspace.editingItem.value"
      :saving="workspace.editingItem.value ? workspace.isSaving(workspace.editingItem.value) : false"
      @save="workspace.editingItem.value && workspace.saveEditingItem(workspace.editingItem.value)"
      @cancel="workspace.closeEditing"
    />
  </AdminWorkspace>
</template>
