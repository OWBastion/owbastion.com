<script setup lang="ts">
import type { AchievementChallenge } from "../composables/useSubmissionUpload";
import { mapVariantLabel } from "../utils/map-variant";

const props = withDefaults(defineProps<{ maps: Array<{ mapId: string; mapName: string }>; challenges: AchievementChallenge[]; selectedChallengeId: string; selectedMapId?: string }>(), { selectedMapId: "" });
const emit = defineEmits<{ select: [selection: { challengeId: string; mapId?: string }] }>();
const selectedMapId = shallowRef(props.selectedMapId);
watch(() => props.selectedMapId, (value) => { if (value) selectedMapId.value = value; });
const mapChallenge = (challenge: AchievementChallenge) => challenge.scope === "map";
const mapAllowed = (challenge: AchievementChallenge, mapId: string) => !challenge.mapIds?.length || challenge.mapIds.includes(mapId);
const isSelected = (challenge: AchievementChallenge, mapId = "") => props.selectedChallengeId === challenge.challengeId && props.selectedMapId === mapId;
const mapChallenges = computed(() => props.challenges.filter(mapChallenge));
const globalChallenges = computed(() => props.challenges.filter((challenge) => !mapChallenge(challenge)));

const compareChallenges = (left: AchievementChallenge, right: AchievementChallenge) => left.titleName.localeCompare(right.titleName, "zh-CN");
const groupedChallenges = (challenges: AchievementChallenge[]) => {
  const groups = new Map<string, AchievementChallenge[]>();
  for (const challenge of challenges) groups.set(challenge.category, [...(groups.get(challenge.category) ?? []), challenge]);
  return [...groups]
    .map(([category, items]) => ({ category, challenges: [...items].sort(compareChallenges) }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
};
const mapItems = computed(() => [...props.maps].sort((left, right) => left.mapName.localeCompare(right.mapName, "zh-CN")).map((map) => ({ label: map.mapName, value: map.mapId })));
const automaticChallenges = computed(() => [...globalChallenges.value, ...mapChallenges.value.filter((challenge) => selectedMapId.value && mapAllowed(challenge, selectedMapId.value))].filter((challenge) => challenge.submissionMode === "automatic").sort(compareChallenges));
const scheduledChallenges = computed(() => [...globalChallenges.value, ...mapChallenges.value.filter((challenge) => selectedMapId.value && mapAllowed(challenge, selectedMapId.value))].filter((challenge) => challenge.submissionMode === "manual" && challenge.status === "scheduled").sort(compareChallenges));
const manualGroups = computed(() => groupedChallenges(globalChallenges.value.filter((challenge) => challenge.submissionMode !== "automatic" && challenge.status !== "scheduled")));
const mapManualGroups = computed(() => groupedChallenges(mapChallenges.value.filter((challenge) => challenge.submissionMode !== "automatic" && challenge.status !== "scheduled" && mapAllowed(challenge, selectedMapId.value))));
</script>

<template>
  <section class="catalog-section" aria-labelledby="achievement-catalog-title">
    <div class="catalog-heading"><h2 id="achievement-catalog-title">选择成就目标</h2></div>
    <section v-if="mapChallenges.length" class="achievement-section"><div class="group-heading"><h3>选择地图后查看可用目标</h3></div><USelect v-model="selectedMapId" aria-label="选择地图" placeholder="选择地图" :items="mapItems" /></section>
    <section v-if="automaticChallenges.length" class="automatic-section" aria-labelledby="automatic-title">
      <div class="group-heading"><h3 id="automatic-title">自动获得</h3><span class="type-label-sm">{{ automaticChallenges.length }} 个称号</span></div>
      <div class="directory-grid">
        <article v-for="challenge in automaticChallenges" :key="challenge.scope === 'map' ? `${selectedMapId}:${challenge.challengeId}` : challenge.challengeId" class="achievement-card automatic"><strong class="type-card-title">{{ challenge.titleName }}</strong><span class="type-label-sm card-kicker">{{ challenge.category }}</span><span v-if="challenge.scope === 'map'" class="type-label-sm card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span class="type-label-sm">{{ challenge.condition }}</span><small class="type-caption">满足条件后自动获得，无需提交截图。</small></article>
      </div>
    </section>
    <section v-for="group in manualGroups" :key="group.category" class="achievement-section" :aria-labelledby="`category-${group.category}`">
      <div class="group-heading"><div><h3 :id="`category-${group.category}`">{{ group.category }}</h3></div><span class="type-label-sm">{{ group.challenges.length }} 个目标</span></div>
      <div class="directory-grid">
        <button v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card pressable-soft" :class="{ selected: isSelected(challenge) }" type="button" :aria-pressed="isSelected(challenge)" @click="emit('select', { challengeId: challenge.challengeId })"><strong class="type-card-title">{{ challenge.titleName }}</strong><span v-if="challenge.scope === 'map'" class="type-label-sm card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span class="type-label-sm">{{ challenge.condition }}</span><span v-if="challenge.status === 'sunsetting'" class="sunsetting type-caption"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></button>
      </div>
    </section>
    <section v-for="group in mapManualGroups" :key="`map-${group.category}`" class="achievement-section"><div class="group-heading"><h3>{{ group.category }}</h3><span class="type-label-sm">{{ group.challenges.length }} 个目标</span></div><div class="directory-grid"><button v-for="challenge in group.challenges" :key="`${selectedMapId}:${challenge.challengeId}`" class="achievement-card pressable-soft" :class="{ selected: isSelected(challenge, selectedMapId) }" type="button" :aria-pressed="isSelected(challenge, selectedMapId)" @click="emit('select', { challengeId: challenge.challengeId, mapId: selectedMapId })"><strong class="type-card-title">{{ challenge.titleName }}</strong><span class="type-label-sm card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span class="type-label-sm">{{ challenge.condition }}</span></button></div></section>
    <section v-if="scheduledChallenges.length" class="achievement-section upcoming-section" aria-labelledby="upcoming-achievements-title">
      <div class="group-heading"><h3 id="upcoming-achievements-title">未开放</h3><span class="type-label-sm">{{ scheduledChallenges.length }} 个称号</span></div>
      <div class="directory-grid"><article v-for="challenge in scheduledChallenges" :key="challenge.challengeId" class="achievement-card upcoming"><strong class="type-card-title">{{ challenge.titleName }}</strong><span v-if="challenge.scope === 'map'" class="type-label-sm card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span class="type-label-sm">{{ challenge.condition }}</span><small class="type-caption">暂不接受截图提交。</small></article></div>
    </section>
    <p v-if="!automaticChallenges.length && !manualGroups.length && !scheduledChallenges.length" class="empty-state">暂无可提交的成就挑战。地图通关仍可提交。</p>
  </section></template>

<style scoped>
.catalog-section, .achievement-section, .automatic-section { display: grid; gap: var(--space-4); }
.catalog-heading { display: grid; }
.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; font-weight: 700; letter-spacing: -.04em; }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); padding-top: var(--space-2); }
.group-heading h3 { margin: 0; color: var(--text); font-size: 1rem; font-weight: 600; letter-spacing: -.02em; }
.group-heading > span, .card-kicker, .achievement-card small { color: var(--quiet); }
.group-heading > span { white-space: nowrap; }
.achievement-card { display: grid; align-content: start; gap: var(--space-2); min-width: 0; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); color: var(--muted); background: var(--surface); font: inherit; text-align: left; }
.achievement-card strong { overflow-wrap: anywhere; color: var(--text); }
.achievement-card:hover, .achievement-card:focus-visible { border-color: var(--line-strong); }
.achievement-card.selected { border-color: var(--accent); background: var(--accent-surface); }
.achievement-card.automatic { background: color-mix(in oklch, var(--surface-raised) 62%, var(--surface)); }
.achievement-card small { margin-top: auto; }
.automatic-section { padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: color-mix(in oklch, var(--surface-raised) 48%, var(--surface)); }
.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: var(--space-1); margin-top: auto; overflow: hidden; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: var(--radius-pill); color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-weight: 600; }
.sunsetting b { padding-left: var(--space-2); font-weight: 600; }
.sunsetting i { padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1); border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 600; }
.empty-state { margin: 0; padding: var(--space-4); border: 1px dashed var(--line-strong); border-radius: var(--radius-control); color: var(--muted); line-height: 1.6; }
</style>
