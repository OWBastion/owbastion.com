<script setup lang="ts">
import type { AchievementChallenge } from "../composables/useSubmissionUpload";

const props = defineProps<{ challenges: AchievementChallenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();

const automaticChallenges = computed(() => props.challenges.filter((challenge) => challenge.submissionMode === "automatic"));
const manualGroups = computed(() => {
  const groups = new Map<string, AchievementChallenge[]>();
  for (const challenge of props.challenges) {
    if (challenge.submissionMode === "automatic") continue;
    groups.set(challenge.category, [...(groups.get(challenge.category) ?? []), challenge]);
  }
  return [...groups].map(([category, challenges]) => ({ category, challenges }));
});
</script>

<template>
  <section class="catalog-section" aria-labelledby="achievement-catalog-title">
    <div class="catalog-heading"><p class="eyebrow">公开证据规则</p><h2 id="achievement-catalog-title">选择成就目标</h2></div>
    <section v-if="automaticChallenges.length" class="automatic-section" aria-labelledby="automatic-title">
      <div class="group-heading"><div><p class="card-kicker">系统自动判定</p><h3 id="automatic-title">自动发放</h3></div><span>{{ automaticChallenges.length }} 个称号</span></div>
      <div class="achievement-grid">
        <article v-for="challenge in automaticChallenges" :key="challenge.challengeId" class="achievement-card automatic"><span class="card-kicker">{{ challenge.category }}</span><strong>{{ challenge.titleName }}</strong><span>{{ challenge.condition }}</span><small>系统满足条件后自动发放，无需提交截图。</small></article>
      </div>
    </section>
    <section v-for="group in manualGroups" :key="group.category" class="achievement-section" :aria-labelledby="`category-${group.category}`">
      <div class="group-heading"><div><p class="card-kicker">称号系列</p><h3 :id="`category-${group.category}`">{{ group.category }}</h3></div><span>{{ group.challenges.length }} 个目标</span></div>
      <div class="achievement-grid">
        <button v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card" :class="{ selected: selectedChallengeId === challenge.challengeId }" type="button" @click="emit('select', challenge.challengeId)"><span class="card-kicker">挑战称号</span><strong>{{ challenge.titleName }}</strong><span>{{ challenge.condition }}</span><span v-if="challenge.status === 'sunsetting'" class="sunsetting"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></button>
      </div>
    </section>
    <p v-if="!automaticChallenges.length && !manualGroups.length" class="empty-state">暂无可提交的成就挑战。地图通关仍可提交。</p>
  </section>
</template>

<style scoped>
.catalog-section, .achievement-section, .automatic-section { display: grid; gap: 16px; }.catalog-section { max-height: min(65vh, 620px); overflow: auto; padding: 2px; }.catalog-heading { display: grid; gap: 6px; }.catalog-heading .eyebrow, .group-heading p { margin: 0; }.catalog-heading h2 { margin: 0; color: var(--text); font-size: 1.35rem; letter-spacing: -.04em; }
.group-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding-top: 8px; }.group-heading h3 { margin: 3px 0 0; color: var(--text); font-size: 1rem; letter-spacing: -.02em; }.group-heading > span { color: var(--quiet); font-size: .74rem; white-space: nowrap; }.card-kicker { color: var(--quiet); font-size: .74rem; }.achievement-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.achievement-card { display: grid; min-height: 126px; align-content: start; gap: 7px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); background: var(--surface); font: inherit; text-align: left; }.achievement-card strong { color: var(--text); font-size: .95rem; }.achievement-card > span:last-of-type:not(.sunsetting) { font-size: .8rem; line-height: 1.45; }.achievement-card:hover, .achievement-card:focus-visible { border-color: var(--line-strong); }.achievement-card:active { transform: scale(.985); }.achievement-card.selected { border-color: var(--accent); background: var(--accent-surface); }.achievement-card.automatic { color: var(--muted); background: color-mix(in oklch, var(--surface-raised) 62%, var(--surface)); }.achievement-card small { margin-top: auto; color: var(--quiet); font-size: .72rem; line-height: 1.45; }.automatic-section { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in oklch, var(--surface-raised) 48%, var(--surface)); }.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: 5px; margin-top: auto; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: 999px; overflow: hidden; color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-size: .68rem !important; font-weight: 700; }.sunsetting b { padding-left: 7px; }.sunsetting i { padding: 3px 7px 3px 5px; border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 650; }
.empty-state { margin: 0; padding: 18px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); line-height: 1.6; }
@media (max-width: 820px) { .catalog-section { max-height: none; overflow: visible; } }
</style>
