<script setup lang="ts">
import type { PlayerMasteryMapProfile, PortalMap } from "~/composables/usePortalApi";
import type { OwnedTitle } from "~/types/title";
import { buildMapProgressRows, isStartedMapRow, type MapProgressChallenge } from "~/utils/map-progress";

const props = withDefaults(defineProps<{
  maps: PortalMap[];
  challenges: MapProgressChallenge[];
  titles: OwnedTitle[];
  profiles: PlayerMasteryMapProfile[];
  showTargets?: boolean;
  showMasteryFacts?: boolean;
  titleProgressAvailable?: boolean;
}>(), { showTargets: false, showMasteryFacts: true, titleProgressAvailable: true });

const open = shallowRef(false);
const rows = computed(() => buildMapProgressRows({ maps: props.maps, challenges: props.challenges, titles: props.titles, profiles: props.profiles }));
const startedIds = computed(() => new Set(rows.value.filter(isStartedMapRow).map((row) => row.map.mapId)));
const started = computed(() => props.maps.filter((map) => startedIds.value.has(map.mapId)));
const untouched = computed(() => props.maps.filter((map) => !startedIds.value.has(map.mapId)));
const overviewProps = computed(() => ({ challenges: props.challenges, titles: props.titles, profiles: props.profiles, showTargets: props.showTargets, showMasteryFacts: props.showMasteryFacts, titleProgressAvailable: props.titleProgressAvailable }));
</script>

<template>
  <div class="map-progress-section">
    <PlayerMapProgressOverview v-if="started.length" :maps="started" v-bind="overviewProps" />
    <UEmpty v-else-if="!untouched.length" title="暂无地图" variant="naked" />
    <UCollapsible v-if="untouched.length" v-model:open="open" class="map-progress-section__rest">
      <UButton :label="started.length ? `还有 ${untouched.length} 张地图没有记录` : `${untouched.length} 张地图还没有记录`" color="neutral" variant="outline" trailing-icon="i-lucide-chevron-down" block />
      <template #content>
        <PlayerMapProgressOverview class="map-progress-section__list" :maps="untouched" v-bind="overviewProps" />
      </template>
    </UCollapsible>
  </div>
</template>

<style scoped>
.map-progress-section { display: grid; gap: var(--space-4); min-width: 0; }
.map-progress-section__list { margin-top: var(--space-4); }
</style>
