<script setup lang="ts">
import type { AchievementChallenge, Map, MapChallenge } from "../composables/useSubmissionUpload";
import AchievementSubmissionCatalog from "./AchievementSubmissionCatalog.vue";
import MapSubmissionCatalog from "./MapSubmissionCatalog.vue";

const props = withDefaults(defineProps<{ maps: Map[]; mapChallenges: MapChallenge[]; achievementChallenges: AchievementChallenge[]; selectedChallengeId: string; selectedMapId?: string }>(), { selectedMapId: "" });
const emit = defineEmits<{ select: [selection: { challengeId: string; mapId?: string }] }>();
const family = shallowRef<"map" | "achievement">("map");
const familyItems = [
  { label: "地图通关", value: "map" },
  { label: "成就挑战", value: "achievement" },
];
</script>

<template>
  <div class="catalog">
    <UTabs v-model="family" :items="familyItems" variant="link" aria-label="挑战类型" />
    <MapSubmissionCatalog v-if="family === 'map'" :maps="maps" :challenges="mapChallenges" :selected-challenge-id="selectedChallengeId" :selected-map-id="selectedMapId" @select="emit('select', { challengeId: $event.challengeId, mapId: $event.mapId })" />
    <AchievementSubmissionCatalog v-else :maps="maps" :challenges="achievementChallenges" :selected-challenge-id="selectedChallengeId" :selected-map-id="selectedMapId" @select="emit('select', $event)" />
  </div>
</template>

<style scoped>
.catalog { display: grid; gap: 24px; min-width: 0; }
</style>
