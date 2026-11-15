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
  <section v-if="stages.length" class="detail-positions" aria-labelledby="map-positions-title">
    <h3 id="map-positions-title" class="sr-only">点位分布</h3>
    <MapPositionOverview :stages="stages" />
  </section>
</template>
