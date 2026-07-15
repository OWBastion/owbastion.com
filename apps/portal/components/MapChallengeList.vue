<script setup lang="ts">
import { computed, shallowRef } from "vue";
import type { Challenge, Map } from "../composables/useSubmissionUpload";

const props = defineProps<{ maps: Map[]; challenges: Challenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
const expandedMapId = shallowRef("");
const mapItems = computed(() => props.maps.map((map) => ({ map, challenges: props.challenges.filter((challenge) => challenge.mapId === map.mapId) })));
const toggleMap = (mapId: string) => { expandedMapId.value = expandedMapId.value === mapId ? "" : mapId; };
</script>

<template>
  <div v-if="mapItems.length" class="map-list">
    <article v-for="item in mapItems" :key="item.map.mapId" class="map-card">
      <button class="map-card-toggle" type="button" :aria-expanded="expandedMapId === item.map.mapId" @click="toggleMap(item.map.mapId)">
        <span><strong>{{ item.map.mapName }}</strong><small>{{ item.map.gameVersion }}</small></span>
        <span class="map-card-action">{{ expandedMapId === item.map.mapId ? "收起" : "选择挑战" }}</span>
      </button>
      <div v-if="expandedMapId === item.map.mapId" class="map-card-challenges">
        <ChallengeList :challenges="item.challenges" :selected-challenge-id="selectedChallengeId" @select="emit('select', $event)" />
      </div>
    </article>
  </div>
  <p v-else class="catalog-empty">暂无支持的地图</p>
</template>

<style scoped>
.map-list { display: grid; gap: 10px; }
.map-card { overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.map-card-toggle { display: flex; align-items: center; justify-content: space-between; gap: 20px; width: 100%; padding: 18px; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }
.map-card-toggle span:first-child { display: grid; gap: 5px; }
.map-card-toggle strong { font-size: 1rem; letter-spacing: -.02em; }
.map-card-toggle small, .map-card-action { color: var(--quiet); font-size: .75rem; }
.map-card-action { color: var(--accent); font-weight: 700; white-space: nowrap; }
.map-card-challenges { padding: 0 10px 10px; }
.catalog-empty { margin: 0; color: var(--quiet); font-size: .85rem; }
</style>
