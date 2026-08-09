<script setup lang="ts">
import type { AchievementChallenge } from "../composables/useSubmissionUpload";
import { mapVariantLabel } from "../utils/map-variant";

const props = withDefaults(defineProps<{ maps: Array<{ mapId: string; mapName: string }>; challenges: AchievementChallenge[]; selectedChallengeId: string; selectedMapId?: string }>(), { selectedMapId: "" });
const emit = defineEmits<{ select: [selection: { challengeId: string; mapId?: string }] }>();
const selectedMapId = shallowRef("");
const mapItems = computed(() => props.maps.map((map) => ({ label: map.mapName, value: map.mapId })));
const mapChallenge = (challenge: AchievementChallenge) => challenge.scope === "map";
const mapAllowed = (challenge: AchievementChallenge, mapId: string) => !challenge.mapIds?.length || challenge.mapIds.includes(mapId);
const isSelected = (challenge: AchievementChallenge, mapId = "") => props.selectedChallengeId === challenge.challengeId && props.selectedMapId === mapId;
const mapChallenges = computed(() => props.challenges.filter(mapChallenge));
const globalChallenges = computed(() => props.challenges.filter((challenge) => !mapChallenge(challenge)));

const automaticChallenges = computed(() => [...globalChallenges.value, ...mapChallenges.value.filter((challenge) => selectedMapId.value && mapAllowed(challenge, selectedMapId.value))].filter((challenge) => challenge.submissionMode === "automatic"));
const scheduledChallenges = computed(() => [...globalChallenges.value, ...mapChallenges.value.filter((challenge) => selectedMapId.value && mapAllowed(challenge, selectedMapId.value))].filter((challenge) => challenge.submissionMode === "manual" && challenge.status === "scheduled"));
const manualGroups = computed(() => {
  const groups = new Map<string, AchievementChallenge[]>();
  for (const challenge of globalChallenges.value) {
    if (challenge.submissionMode === "automatic" || challenge.status === "scheduled") continue;
    groups.set(challenge.category, [...(groups.get(challenge.category) ?? []), challenge]);
  }
  return [...groups].map(([category, challenges]) => ({ category, challenges }));
});
const mapManualGroups = computed(() => {
  const groups = new Map<string, AchievementChallenge[]>();
  for (const challenge of mapChallenges.value) {
    if (challenge.submissionMode === "automatic" || challenge.status === "scheduled" || !mapAllowed(challenge, selectedMapId.value)) continue;
    groups.set(challenge.category, [...(groups.get(challenge.category) ?? []), challenge]);
  }
  return [...groups].map(([category, challenges]) => ({ category, challenges }));
});
</script>

<template>
  <section class="catalog-section" aria-labelledby="achievement-catalog-title">
    <div class="catalog-heading"><h2 id="achievement-catalog-title">选择成就目标</h2></div>
    <section v-if="mapChallenges.length" class="achievement-section"><div class="group-heading"><div><p class="card-kicker">地图范围挑战</p><h3>选择地图后查看可用目标</h3></div></div><USelect v-model="selectedMapId" aria-label="选择地图" placeholder="选择地图" :items="mapItems" /></section>
    <section v-if="automaticChallenges.length" class="automatic-section" aria-labelledby="automatic-title">
      <div class="group-heading"><div><h3 id="automatic-title">自动获得</h3></div><span>{{ automaticChallenges.length }} 个称号</span></div>
      <div class="achievement-grid">
        <article v-for="challenge in automaticChallenges" :key="challenge.scope === 'map' ? `${selectedMapId}:${challenge.challengeId}` : challenge.challengeId" class="achievement-card automatic"><span class="card-kicker">{{ challenge.category }}</span><strong>{{ challenge.titleName }}</strong><span v-if="challenge.scope === 'map'" class="card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span>{{ challenge.condition }}</span><small>满足条件后自动获得，无需提交截图。</small></article>
      </div>
    </section>
    <section v-for="group in manualGroups" :key="group.category" class="achievement-section" :aria-labelledby="`category-${group.category}`">
      <div class="group-heading"><div><p class="card-kicker">称号系列</p><h3 :id="`category-${group.category}`">{{ group.category }}</h3></div><span>{{ group.challenges.length }} 个目标</span></div>
      <div class="achievement-grid">
        <button v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card" :class="{ selected: isSelected(challenge) }" type="button" @click="emit('select', { challengeId: challenge.challengeId })"><span class="card-kicker">成就挑战</span><strong>{{ challenge.titleName }}</strong><span v-if="challenge.scope === 'map'" class="card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span>{{ challenge.condition }}</span><span v-if="challenge.status === 'sunsetting'" class="sunsetting"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></button>
      </div>
    </section>
    <section v-for="group in mapManualGroups" :key="`map-${group.category}`" class="achievement-section"><div class="group-heading"><div><p class="card-kicker">地图称号系列</p><h3>{{ group.category }}</h3></div><span>{{ group.challenges.length }} 个目标</span></div><div class="achievement-grid"><button v-for="challenge in group.challenges" :key="`${selectedMapId}:${challenge.challengeId}`" class="achievement-card" :class="{ selected: isSelected(challenge, selectedMapId) }" type="button" @click="emit('select', { challengeId: challenge.challengeId, mapId: selectedMapId })"><span class="card-kicker">地图挑战</span><strong>{{ challenge.titleName }}</strong><span class="card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span>{{ challenge.condition }}</span></button></div></section>
    <section v-if="scheduledChallenges.length" class="achievement-section upcoming-section" aria-labelledby="upcoming-achievements-title">
      <div class="group-heading"><div><p class="card-kicker">暂未开放</p><h3 id="upcoming-achievements-title">即将开始</h3></div><span>{{ scheduledChallenges.length }} 个称号</span></div>
      <div class="achievement-grid"><article v-for="challenge in scheduledChallenges" :key="challenge.challengeId" class="achievement-card upcoming"><span class="card-kicker">成就挑战</span><strong>{{ challenge.titleName }}</strong><span v-if="challenge.scope === 'map'" class="card-kicker">{{ mapVariantLabel(challenge.mapVariant) }}</span><span>{{ challenge.condition }}</span><small>未开放，暂不接受截图提交。</small></article></div>
    </section>
    <p v-if="!automaticChallenges.length && !manualGroups.length && !scheduledChallenges.length" class="empty-state">暂无可提交的成就挑战。地图通关仍可提交。</p>
  </section></template>

<style scoped>
.catalog-section, .achievement-section, .automatic-section { display: grid; gap: 16px; }.catalog-section { max-height: min(65vh, 620px); overflow: auto; padding: 2px; }.catalog-heading { display: grid; }.group-heading p { margin: 0; }.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; letter-spacing: -.04em; }
.group-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding-top: 8px; }.group-heading h3 { margin: 3px 0 0; color: var(--text); font-size: 1rem; letter-spacing: -.02em; }.group-heading > span { color: var(--quiet); font-size: .74rem; white-space: nowrap; }.card-kicker { color: var(--quiet); font-size: .74rem; }.achievement-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.achievement-card { display: grid; min-height: 126px; align-content: start; gap: 7px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); background: var(--surface); font: inherit; text-align: left; }.achievement-card strong { color: var(--text); font-size: .95rem; }.achievement-card > span:last-of-type:not(.sunsetting) { font-size: .8rem; line-height: 1.45; }.achievement-card:hover, .achievement-card:focus-visible { border-color: var(--line-strong); }.achievement-card:active { transform: scale(.985); }.achievement-card.selected { border-color: var(--accent); background: var(--accent-surface); }.achievement-card.automatic { color: var(--muted); background: color-mix(in oklch, var(--surface-raised) 62%, var(--surface)); }.achievement-card small { margin-top: auto; color: var(--quiet); font-size: .72rem; line-height: 1.45; }.automatic-section { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in oklch, var(--surface-raised) 48%, var(--surface)); }.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: 5px; margin-top: auto; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: 999px; overflow: hidden; color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-size: .68rem !important; font-weight: 700; }.sunsetting b { padding-left: 7px; }.sunsetting i { padding: 3px 7px 3px 5px; border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 650; }
.empty-state { margin: 0; padding: 18px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); line-height: 1.6; }
@media (max-width: 820px) { .catalog-section { max-height: none; overflow: visible; } }
</style>
