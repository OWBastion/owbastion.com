<script setup lang="ts">
import type { Challenge, Map } from "../composables/useSubmissionUpload";
import ChallengeList from "./ChallengeList.vue";
import MapChallengeList from "./MapChallengeList.vue";

defineProps<{ maps: Map[]; challenges: Challenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
</script>

<template>
  <div class="catalog">
    <section class="catalog-section" aria-labelledby="challenge-catalog-title">
      <div class="catalog-heading"><p class="eyebrow">成就挑战</p><h2 id="challenge-catalog-title">选择一个目标</h2></div>
      <ChallengeList :challenges="challenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
    </section>
    <section class="catalog-section" aria-labelledby="map-catalog-title">
      <div class="catalog-heading"><p class="eyebrow">地图</p><h2 id="map-catalog-title">按地图查看</h2></div>
      <MapChallengeList :maps="maps" :challenges="challenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
    </section>
  </div>
</template>

<style scoped>
.catalog { display: grid; gap: 42px; }
.catalog-section { display: grid; gap: 16px; }
.catalog-heading { display: grid; gap: 6px; }
.catalog-heading .eyebrow { margin: 0; }
.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; letter-spacing: -.04em; }
</style>
