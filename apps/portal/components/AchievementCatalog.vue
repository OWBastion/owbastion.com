<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";

export type PublicAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  kind: "title_achievement";
  titleKey: string;
  titleName: string;
  icon: string;
  category: string;
  condition: string;
  evidenceRule: string;
  gameVersion: string;
  status: "scheduled" | "active" | "sunsetting";
  startsAt?: number;
  endsAt?: number;
  retiredVersion?: string;
  submissionMode: "manual" | "automatic";
};

const props = defineProps<{ challenges: PublicAchievement[]; ownedTitles?: OwnedTitle[] }>();
const ownedTitleKeys = computed(() => new Set((props.ownedTitles ?? []).map((title) => title.titleKey)));
const ownedOnlyTitles = computed(() => (props.ownedTitles ?? []).filter((title) => !props.challenges.some((challenge) => challenge.titleKey === title.titleKey)));
const groups = computed(() => {
  const grouped = new Map<string, PublicAchievement[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), challenge]);
  return [...grouped.entries()].map(([category, challenges]) => ({ category, challenges }));
});
</script>

<template>
  <div v-if="groups.length || ownedOnlyTitles.length" class="achievement-groups">
    <section v-if="ownedOnlyTitles.length" class="earned-section" aria-labelledby="earned-achievements-title">
      <div class="group-heading"><div><p class="card-kicker">个人记录</p><h2 id="earned-achievements-title">已获得成就</h2></div><span>{{ ownedOnlyTitles.length }} 项</span></div>
      <div class="achievement-grid">
        <article v-for="title in ownedOnlyTitles" :key="title.grantId" class="achievement-card earned">
          <div class="achievement-icon" aria-hidden="true"><UIcon :name="`i-lucide-${title.icon}`" /></div>
          <div class="achievement-card-copy"><span class="card-kicker">{{ title.category }}</span><strong>{{ title.label }}</strong><span>{{ title.condition }}</span><span class="earned-status">已获得</span></div>
        </article>
      </div>
    </section>
    <section v-for="group in groups" :key="group.category" class="achievement-section" :aria-labelledby="`category-${group.category}`">
      <div class="group-heading"><div><h2 :id="`category-${group.category}`">{{ group.category }}</h2></div><span>{{ group.challenges.length }} 项</span></div>
      <div class="achievement-grid">
        <article v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card">
          <div class="achievement-icon" :class="{ earned: ownedTitleKeys.has(challenge.titleKey) }" aria-hidden="true"><UIcon :name="`i-lucide-${challenge.icon}`" /></div>
          <div class="achievement-card-copy"><strong>{{ challenge.titleName }}</strong><span>{{ challenge.condition }}</span><span v-if="ownedTitleKeys.has(challenge.titleKey)" class="earned-status">已获得</span><span v-else-if="challenge.status === 'scheduled'" class="scheduled">未开放</span><span v-else-if="challenge.status === 'sunsetting'" class="sunsetting"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></div>
        </article>
      </div>
    </section>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.achievement-groups, .achievement-section, .earned-section { display: grid; gap: 18px; }.achievement-section + .achievement-section, .earned-section + .achievement-section { margin-top: 58px; }.group-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; }.group-heading h2 { margin: 0; color: var(--text); font-size: clamp(1.55rem, 3vw, 2.2rem); letter-spacing: -.045em; }.group-heading > span { color: var(--quiet); font-size: .78rem; }.achievement-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.achievement-card { display: grid; grid-template-columns: 58px minmax(0, 1fr); min-height: 0; align-content: start; gap: 16px; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }.achievement-card.earned { border-color: color-mix(in oklch, var(--accent) 42%, var(--line)); background: color-mix(in oklch, var(--accent-surface) 48%, var(--surface)); }.achievement-icon { display: grid; width: 58px; height: 58px; place-items: center; border: 1px dashed var(--line-strong); border-radius: 14px; color: var(--quiet); background: color-mix(in oklch, var(--surface-raised) 70%, var(--surface)); font-size: 1.45rem; font-weight: 700; }.achievement-icon.earned, .earned .achievement-icon { border-style: solid; border-color: color-mix(in oklch, var(--accent) 54%, var(--line)); color: var(--accent); background: color-mix(in oklch, var(--accent-surface) 74%, var(--surface)); }.achievement-card-copy { display: grid; gap: 9px; }.achievement-card strong { color: var(--text); font-size: 1.22rem; letter-spacing: -.035em; }.achievement-card-copy > span:not(.sunsetting):not(.earned-status) { color: var(--muted); font-size: .86rem; line-height: 1.6; }.earned-status { width: fit-content; color: color-mix(in oklch, var(--accent) 78%, var(--text)); font-size: .72rem; font-weight: 720; }.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: 6px; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: 999px; overflow: hidden; color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-size: .72rem; font-weight: 700; }.sunsetting b { padding-left: 8px; }.sunsetting i { padding: 4px 8px 4px 6px; border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 650; }
@media (max-width: 620px) { .achievement-grid { grid-template-columns: 1fr; }.achievement-card { min-height: 0; padding: 18px; }.group-heading { align-items: flex-start; flex-direction: column; gap: 8px; } }
</style>
