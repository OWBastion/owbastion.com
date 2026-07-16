<script setup lang="ts">
import type { Map, MapChallenge } from "../composables/useSubmissionUpload";

const props = defineProps<{ maps: Map[]; challenges: MapChallenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
const selectedMapId = shallowRef("");

const selectedMap = computed(() => props.maps.find((map) => map.mapId === selectedMapId.value));
const selectedMapChallenges = computed(() => props.challenges.filter((challenge) => challenge.mapId === selectedMapId.value));

</script>

<template>
  <section class="catalog-section" aria-labelledby="map-catalog-title">
    <div class="catalog-heading"><p class="eyebrow">始终可提交</p><h2 id="map-catalog-title">选择地图挑战</h2></div>
    <UFormField label="选择地图"><USelect v-model="selectedMapId" aria-label="选择地图" placeholder="选择地图" :items="maps.map((map) => ({ label: map.mapName, value: map.mapId }))" /></UFormField>
    <div v-if="selectedMap" class="map-selection">
      <div class="selection-heading"><span>地图挑战</span><strong>{{ selectedMap.mapName }}</strong></div>
      <div v-if="selectedMapChallenges.length" class="map-objectives">
        <button v-for="challenge in selectedMapChallenges" :key="challenge.challengeId" class="objective-button" :class="{ selected: selectedChallengeId === challenge.challengeId }" type="button" @click="emit('select', challenge.challengeId)"><strong>{{ challenge.name }}</strong><span>{{ challenge.difficulty ?? '地图通关' }}</span><span v-if="challenge.status === 'sunsetting'" class="sunsetting"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></button>
      </div>
      <p v-else class="empty-state">该地图暂时没有可提交目标。</p>
    </div>
    <p v-else class="selection-hint">选择地图后，查看该地图可提交的难度与开拓者目标。</p>
  </section>
</template>

<style scoped>
.catalog-section { display: grid; gap: 16px; }.catalog-heading { display: grid; gap: 6px; }.catalog-heading .eyebrow { margin: 0; }.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; letter-spacing: -.04em; }
.filter-field { display: grid; gap: 7px; color: var(--muted); font-size: .82rem; }.filter-field select { min-height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface-raised); font: inherit; }.filter-field select:focus { border-color: var(--line-strong); outline: 2px solid var(--accent-surface); outline-offset: 1px; }
.map-selection { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }.selection-heading { display: grid; gap: 3px; }.selection-heading span { color: var(--quiet); font-size: .74rem; }.selection-heading strong { color: var(--text); font-size: .95rem; }.map-objectives { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }.objective-button { display: grid; gap: 4px; min-height: 64px; padding: 10px; border: 1px solid var(--line); border-radius: 9px; color: var(--muted); background: var(--surface-raised); font: inherit; text-align: left; }.objective-button strong { color: var(--text); font-size: .84rem; }.objective-button span { font-size: .74rem; }.objective-button:hover, .objective-button:focus-visible { border-color: var(--line-strong); }.objective-button:active { transform: scale(.97); }.objective-button.selected { border-color: var(--accent); background: var(--accent-surface); }.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: 5px; margin-top: 3px; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: 999px; overflow: hidden; color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-size: .68rem !important; font-weight: 700; }.sunsetting b { padding-left: 7px; }.sunsetting i { padding: 3px 7px 3px 5px; border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 650; }
.selection-hint, .empty-state { margin: 0; padding: 14px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); line-height: 1.6; }
</style>
