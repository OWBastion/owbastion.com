<script setup lang="ts">
import type { Map, MapChallenge } from "../composables/useSubmissionUpload";
import { mapVariantLabel } from "../utils/map-variant";

const props = withDefaults(defineProps<{ maps: Map[]; challenges: MapChallenge[]; selectedChallengeId: string; selectedMapId?: string; selectedGameplayRevisionId?: string }>(), { selectedMapId: "", selectedGameplayRevisionId: "" });
const emit = defineEmits<{ select: [selection: { challengeId: string; mapId: string; gameplayRevisionId: string }] }>();
const selectedMapId = shallowRef(props.selectedMapId);
watch(() => props.selectedMapId, (value) => { if (value) selectedMapId.value = value; });

const difficultyRank = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;
const selectedMap = computed(() => props.maps.find((map) => map.mapId === selectedMapId.value));
const mapItems = computed(() => [...props.maps].sort((left, right) => left.mapName.localeCompare(right.mapName, "zh-CN")).map((map) => ({ label: map.mapName, value: map.mapId })));
const selectedMapChallenges = computed(() => [...props.challenges.filter((challenge) => challenge.mapId === selectedMapId.value)].sort((left, right) => {
  if (left.kind === "pioneer" && right.kind !== "pioneer") return -1;
  if (right.kind === "pioneer" && left.kind !== "pioneer") return 1;
  const rank = (value?: string) => {
    const index = difficultyRank.indexOf(value as (typeof difficultyRank)[number]);
    return index === -1 ? difficultyRank.length : index;
  };
  return rank(left.difficulty) - rank(right.difficulty) || left.name.localeCompare(right.name, "zh-CN");
}));

</script>

<template>
  <section class="catalog-section" aria-labelledby="map-catalog-title">
    <div class="catalog-heading"><h2 id="map-catalog-title">选择地图挑战</h2></div>
    <UFormField label="选择地图"><USelect v-model="selectedMapId" aria-label="选择地图" placeholder="选择地图" :items="mapItems" /></UFormField>
    <div v-if="selectedMap" class="map-selection">
      <div class="selection-heading"><strong class="type-label">{{ selectedMap.mapName }}</strong></div>
      <div v-if="selectedMapChallenges.length" class="directory-grid">
        <UButton v-for="challenge in selectedMapChallenges" :key="`${selectedMapId}:${challenge.challengeId}:${challenge.gameplayRevisionId}`" :color="props.selectedChallengeId === challenge.challengeId && props.selectedMapId === selectedMapId && props.selectedGameplayRevisionId === challenge.gameplayRevisionId ? 'primary' : 'neutral'" :variant="props.selectedChallengeId === challenge.challengeId && props.selectedMapId === selectedMapId && props.selectedGameplayRevisionId === challenge.gameplayRevisionId ? 'soft' : 'outline'" class="objective-option" type="button" :aria-pressed="props.selectedChallengeId === challenge.challengeId && props.selectedMapId === selectedMapId && props.selectedGameplayRevisionId === challenge.gameplayRevisionId" @click="emit('select', { challengeId: challenge.challengeId, mapId: selectedMapId, gameplayRevisionId: challenge.gameplayRevisionId })"><strong class="type-card-title">{{ challenge.name }}</strong><span class="type-label-sm">{{ challenge.difficulty ?? '地图通关' }}</span><span class="type-label-sm map-variant">{{ mapVariantLabel(challenge.mapVariant) }}</span><span v-if="challenge.status === 'sunsetting'" class="sunsetting type-caption"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></UButton>
      </div>
      <p v-else class="empty-state">该地图暂无提交目标。</p>
    </div>
  </section>
</template>

<style scoped>
.catalog-section { display: grid; gap: var(--space-4); }
.catalog-heading { display: grid; gap: var(--space-2); }
.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; font-weight: 700; letter-spacing: -.04em; }
.map-selection { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.selection-heading { display: grid; }
.selection-heading strong { color: var(--text); }
.objective-option { display: grid; justify-items: start; align-content: start; gap: var(--space-2); min-width: 0; padding: var(--space-4); border-radius: var(--radius-card); text-align: left; font-weight: 500; white-space: normal; }
.objective-option strong { overflow-wrap: anywhere; color: var(--text); }
.map-variant { color: var(--quiet); }
.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: var(--space-1); overflow: hidden; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: var(--radius-pill); color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-weight: 600; }
.sunsetting b { padding-left: var(--space-2); font-weight: 600; }
.sunsetting i { padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1); border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 600; }
.empty-state { margin: 0; padding: var(--space-4); border: 1px dashed var(--line-strong); border-radius: var(--radius-control); color: var(--muted); line-height: 1.6; }
</style>
