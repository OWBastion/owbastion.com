<script setup lang="ts">
import type { AchievementChallenge, Map, MapChallenge } from "../composables/useSubmissionUpload";
import AchievementSubmissionCatalog from "./AchievementSubmissionCatalog.vue";
import MapSubmissionCatalog from "./MapSubmissionCatalog.vue";

const props = defineProps<{ maps: Map[]; mapChallenges: MapChallenge[]; achievementChallenges: AchievementChallenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
const family = shallowRef<"map" | "achievement">("map");
const familyItems = [
  { label: "地图通关", value: "map" },
  { label: "成就挑战", value: "achievement" },
];
</script>

<template>
  <div class="catalog">
    <UTabs v-model="family" :items="familyItems" aria-label="挑战类型" />
    <MapSubmissionCatalog v-if="family === 'map'" :maps="maps" :challenges="mapChallenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
    <AchievementSubmissionCatalog v-else :challenges="achievementChallenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
  </div>
</template>

<style scoped>
.catalog { display: grid; gap: 24px; min-width: 0; }
</style>
