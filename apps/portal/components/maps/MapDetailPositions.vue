<script setup lang="ts">
import type { MapPositionStage, PublicMapPositionsResponse } from "@owbastion/contracts";
import MapPositionOverview from "./MapPositionOverview.vue";

const props = defineProps<{ mapId: string }>();

const api = usePortalApi();
const stages = shallowRef<MapPositionStage[]>([]);

// The overview is supplementary: a failed read leaves the section out instead of showing an error.
watch(() => props.mapId, async (mapId) => {
  stages.value = [];
  try {
    const response = await api<PublicMapPositionsResponse>(`/v1/maps/${encodeURIComponent(mapId)}/positions`);
    if (props.mapId === mapId) stages.value = response.item.stages;
  } catch {
    stages.value = [];
  }
}, { immediate: true });
</script>

<template>
  <details v-if="stages.length" class="detail-positions">
    <summary class="detail-heading">点位分布<UIcon name="i-lucide-chevron-down" class="detail-positions__chevron" aria-hidden="true" /></summary>
    <MapPositionOverview :stages="stages" />
  </details>
</template>


<style scoped>
.detail-positions > summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; }
.detail-positions > summary::-webkit-details-marker { display: none; }
.detail-positions[open] > summary { margin-bottom: var(--space-3); }
.detail-positions__chevron { transition: transform 150ms ease; }
.detail-positions[open] .detail-positions__chevron { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .detail-positions__chevron { transition: none; } }
</style>
