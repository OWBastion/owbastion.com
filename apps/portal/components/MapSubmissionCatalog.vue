<script setup lang="ts">
import type { Map, MapChallenge } from "../composables/useSubmissionUpload";

const props = defineProps<{ maps: Map[]; challenges: MapChallenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
const selectedMapId = shallowRef("");
const expandedMapId = shallowRef<string | null>(null);

const mapGroups = computed(() => props.maps
  .map((map) => ({ map, challenges: props.challenges.filter((challenge) => challenge.mapId === map.mapId) }))
  .filter((group) => group.challenges.length > 0 && (!selectedMapId.value || group.map.mapId === selectedMapId.value)));

const onMapChange = (event: Event) => {
  selectedMapId.value = (event.target as HTMLSelectElement).value;
  expandedMapId.value = selectedMapId.value || null;
};

const toggleMap = (mapId: string) => { expandedMapId.value = expandedMapId.value === mapId ? null : mapId; };
const selectChallenge = (mapId: string, challengeId: string) => { expandedMapId.value = mapId; emit("select", challengeId); };
</script>

<template>
  <section class="catalog-section" aria-labelledby="map-catalog-title">
    <div class="catalog-heading"><p class="eyebrow">始终可提交</p><h2 id="map-catalog-title">选择地图挑战</h2></div>
    <label class="filter-field">选择地图<select :value="selectedMapId" aria-label="按地图筛选" @change="onMapChange"><option value="">全部地图</option><option v-for="map in maps" :key="map.mapId" :value="map.mapId">{{ map.mapName }}</option></select></label>
    <div v-if="mapGroups.length" class="map-grid">
      <article v-for="group in mapGroups" :key="group.map.mapId" class="map-card" :class="{ expanded: expandedMapId === group.map.mapId }">
        <button class="map-card-trigger" type="button" :aria-expanded="expandedMapId === group.map.mapId" @click="toggleMap(group.map.mapId)">
          <span class="card-kicker">地图挑战</span><strong>{{ group.map.mapName }}</strong><span>{{ group.challenges.length }} 个可提交目标</span><span class="disclosure" aria-hidden="true">⌄</span>
        </button>
        <div v-if="expandedMapId === group.map.mapId" class="map-objectives">
          <button v-for="challenge in group.challenges" :key="challenge.challengeId" class="objective-button" :class="{ selected: selectedChallengeId === challenge.challengeId }" type="button" @click="selectChallenge(group.map.mapId, challenge.challengeId)"><strong>{{ challenge.name }}</strong><span>{{ challenge.difficulty ?? '地图通关' }}</span></button>
        </div>
      </article>
    </div>
    <p v-else class="empty-state">没有匹配的地图通关目标。</p>
  </section>
</template>

<style scoped>
.catalog-section { display: grid; gap: 16px; }.catalog-heading { display: grid; gap: 6px; }.catalog-heading .eyebrow { margin: 0; }.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; letter-spacing: -.04em; }
.filter-field { display: grid; gap: 7px; color: var(--muted); font-size: .82rem; }.filter-field select { min-height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface-raised); font: inherit; }.filter-field select:focus { border-color: var(--line-strong); outline: 2px solid var(--accent-surface); outline-offset: 1px; }
.map-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; max-height: min(65vh, 620px); overflow: auto; padding: 2px; }.map-card { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); transition: border-color .16s ease, box-shadow .16s ease; }.map-card.expanded { border-color: var(--line-strong); box-shadow: 0 6px 18px -15px var(--shadow); }
.map-card-trigger { position: relative; display: grid; width: 100%; min-height: 108px; align-content: start; gap: 7px; padding: 14px; border: 0; color: var(--muted); background: transparent; font: inherit; text-align: left; }.map-card-trigger strong { color: var(--text); font-size: .95rem; }.map-card-trigger span:nth-child(3) { font-size: .8rem; }.map-card-trigger:hover, .map-card-trigger:focus-visible { background: color-mix(in oklch, var(--surface-raised) 58%, transparent); }.map-card-trigger:active { transform: scale(.985); }.card-kicker { color: var(--quiet); font-size: .74rem; }.disclosure { position: absolute; top: 15px; right: 14px; color: var(--quiet); font-size: 1rem; transition: transform .16s ease; }.expanded .disclosure { transform: rotate(180deg); }
.map-objectives { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 0 12px 12px; animation: objectives-in .16s ease-out; }.objective-button { display: grid; gap: 4px; min-height: 58px; padding: 9px; border: 1px solid var(--line); border-radius: 9px; color: var(--muted); background: var(--surface-raised); font: inherit; text-align: left; }.objective-button strong { color: var(--text); font-size: .82rem; }.objective-button span { font-size: .72rem; }.objective-button:hover, .objective-button:focus-visible { border-color: var(--line-strong); }.objective-button:active { transform: scale(.97); }.objective-button.selected { border-color: var(--accent); background: var(--accent-surface); }
.empty-state { margin: 0; padding: 18px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); line-height: 1.6; }
@keyframes objectives-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
</style>
