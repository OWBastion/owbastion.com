<script setup lang="ts">
import { useAdminAchievementWorkspace } from "~/components/admin/useAdminAchievementWorkspace";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "地图挑战 · 躲避堡垒 3" });

const route = useRoute();
const workspace = useAdminAchievementWorkspace();
const { maps, mapItems, loading, errorMessage, openCreate, toggleEditing } = workspace;
</script>

<template>
  <AdminWorkspace title="地图挑战">
    <template #actions><UButton label="新建挑战" icon="i-lucide-plus" @click="openCreate" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <AdminAchievementNav />
    <AdminMapAchievementWorkspace :maps="maps" :challenges="mapItems" :loading="loading" :initial-map-id="typeof route.query.mapId === 'string' ? route.query.mapId : ''" :initial-rule-id="typeof route.query.ruleId === 'string' ? route.query.ruleId : ''" @edit-challenge="(challenge) => toggleEditing(challenge.challengeId, challenge.mapId, challenge.gameplayRevisionId)" />
    <AdminAchievementDialogs :workspace="workspace" />
  </AdminWorkspace>
</template>
