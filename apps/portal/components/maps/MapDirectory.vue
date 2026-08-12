<script setup lang="ts">
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";
import MapCard from "./MapCard.vue";
import MapDetailModal from "./MapDetailModal.vue";
import { useReviewSummaries } from "~/composables/useReviewSummaries";
import type { CurrentPlayerMasteryResponse, PlayerMasteryMapProfile } from "~/composables/usePortalApi";

const props = defineProps<{
  maps: Map[];
  challenges: MapChallenge[];
  authenticated: boolean;
  masteryProfiles: PlayerMasteryMapProfile[];
  masteryLoading: boolean;
  masteryError: string;
  masteryHistory: CurrentPlayerMasteryResponse | null;
  masteryHistoryMapId: string | null;
  masteryHistoryLoading: boolean;
  masteryHistoryError: string;
  selectedMapId?: string;
}>();

const selectedMap = shallowRef<Map | null>(null);
const modalOpen = shallowRef(false);
const selectedMasteryHistory = computed(() => selectedMap.value?.mapId === props.masteryHistoryMapId ? props.masteryHistory : null);
const selectedMasteryProfile = computed(() => selectedMap.value
  ? props.masteryProfiles.find((profile) => profile.mapId === selectedMap.value?.mapId) ?? selectedMasteryHistory.value?.profiles.find((profile) => profile.mapId === selectedMap.value?.mapId) ?? null
  : null);
const selectedMasteryHistoryLoading = computed(() => selectedMap.value?.mapId === props.masteryHistoryMapId && props.masteryHistoryLoading);
const selectedMasteryHistoryError = computed(() => selectedMap.value?.mapId === props.masteryHistoryMapId ? props.masteryHistoryError : "");
const reviewSummaries = useReviewSummaries("map", () => props.maps.map((map) => map.mapId));
const reviewLoading = computed(() => reviewSummaries.loading.value);
const reviewError = computed(() => reviewSummaries.error.value);
const refreshReviewSummaries = () => reviewSummaries.refresh();
const emit = defineEmits<{
  "retry-mastery": [];
  "history-page": [input: { mapId: string; page: number }];
}>();

const openMap = (map: Map) => {
  selectedMap.value = map;
  modalOpen.value = true;
  if (props.authenticated) emit("history-page", { mapId: map.mapId, page: 1 });
};

const openSelectedMap = () => {
  if (!props.selectedMapId) return;
  const map = props.maps.find((candidate) => candidate.mapId === props.selectedMapId);
  if (map && selectedMap.value?.mapId !== map.mapId) openMap(map);
};

watch([() => props.selectedMapId, () => props.maps], openSelectedMap, { immediate: true });

const requestHistoryPage = (page: number) => {
  if (selectedMap.value) emit("history-page", { mapId: selectedMap.value.mapId, page });
};
</script>

<template>
  <section class="map-directory" aria-label="地图列表">
    <div v-if="props.maps.length" class="map-grid"><MapCard v-for="map in props.maps" :key="map.mapId" :map="map" :challenges="props.challenges" :authenticated="props.authenticated" :review-summary="reviewSummaries.summaryFor(map.mapId)" :review-loading="reviewLoading" :review-error="reviewError" :mastery-profile="props.masteryProfiles.find((profile) => profile.mapId === map.mapId) ?? null" :mastery-loading="props.masteryLoading" :mastery-error="props.masteryError" @select="openMap(map)" /></div>
    <UEmpty v-else title="暂无地图" variant="naked" />
    <MapDetailModal v-model:open="modalOpen" :map="selectedMap" :challenges="props.challenges" :authenticated="props.authenticated" :mastery-profile="selectedMasteryProfile" :mastery-loading="props.masteryLoading" :mastery-error="props.masteryError" :mastery-history="selectedMasteryHistory" :mastery-history-loading="selectedMasteryHistoryLoading" :mastery-history-error="selectedMasteryHistoryError" @review-changed="refreshReviewSummaries" @retry-mastery="emit('retry-mastery')" @history-page="requestHistoryPage" @retry-history="requestHistoryPage(selectedMasteryHistory?.page ?? 1)" />
  </section>
</template>

<style scoped>
.map-directory { display: grid; gap: 26px; }.map-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }
@media (max-width: 820px) { .map-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .map-grid { grid-template-columns: 1fr; } }
</style>
