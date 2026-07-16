<script setup lang="ts">
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";
import MapCard from "./MapCard.vue";
import MapDetailModal from "./MapDetailModal.vue";

const props = defineProps<{
  maps: Map[];
  challenges: MapChallenge[];
  authenticated: boolean;
}>();

const selectedMap = shallowRef<Map | null>(null);
const modalOpen = shallowRef(false);

const openMap = (map: Map) => {
  selectedMap.value = map;
  modalOpen.value = true;
};
</script>

<template>
  <section class="map-directory" aria-label="地图列表">
    <div v-if="props.maps.length" class="map-grid"><MapCard v-for="map in props.maps" :key="map.mapId" :map="map" :challenges="props.challenges" :authenticated="props.authenticated" @select="openMap(map)" /></div>
    <UEmpty v-else title="暂无地图" description="当前没有可展示的地图。" variant="naked" />
    <MapDetailModal v-model:open="modalOpen" :map="selectedMap" :challenges="props.challenges" :authenticated="props.authenticated" />
  </section>
</template>

<style scoped>
.map-directory { display: grid; gap: 26px; }.map-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }
@media (max-width: 860px) { .map-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .map-grid { grid-template-columns: 1fr; } }
</style>
