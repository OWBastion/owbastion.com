<script setup lang="ts">
import type { AchievementChallenge, Map, MapChallenge } from "../composables/useSubmissionUpload";
import AchievementSubmissionCatalog from "./AchievementSubmissionCatalog.vue";
import MapSubmissionCatalog from "./MapSubmissionCatalog.vue";

const props = defineProps<{ maps: Map[]; mapChallenges: MapChallenge[]; achievementChallenges: AchievementChallenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
const family = shallowRef<"map" | "achievement">("map");
</script>

<template>
  <div class="catalog">
    <div class="segmented" role="tablist" aria-label="挑战类型">
      <button class="segment" :class="{ active: family === 'map' }" :aria-selected="family === 'map'" role="tab" type="button" @click="family = 'map'">地图通关 <span>{{ mapChallenges.length }}</span></button>
      <button class="segment" :class="{ active: family === 'achievement' }" :aria-selected="family === 'achievement'" role="tab" type="button" @click="family = 'achievement'">成就挑战 <span>{{ achievementChallenges.length }}</span></button>
    </div>
    <MapSubmissionCatalog v-if="family === 'map'" :maps="maps" :challenges="mapChallenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
    <AchievementSubmissionCatalog v-else :challenges="achievementChallenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
  </div>
</template>

<style scoped>
.catalog { display: grid; gap: 24px; min-width: 0; }
.segmented { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 4px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface-raised); }
.segment { min-height: 40px; border: 0; border-radius: 9px; color: var(--muted); background: transparent; font: inherit; font-size: .88rem; cursor: pointer; transition: color .16s ease, background .16s ease, box-shadow .16s ease; }
.segment span { color: var(--quiet); font-size: .76rem; }
.segment.active { color: var(--text); background: var(--surface); box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }
</style>
