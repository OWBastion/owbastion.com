<script setup lang="ts">
import type { Challenge } from "@owbastion/contracts";
import type { OwnedTitle } from "~/types/title";
import { achievementState, findOwnedTitle } from "~/utils/achievement-status";

export type PublicAchievement = Extract<Challenge, { family: "achievement" }>;

const props = defineProps<{ challenges: PublicAchievement[]; titles?: OwnedTitle[] }>();
const stateOf = (challenge: PublicAchievement) => achievementState(findOwnedTitle(props.titles, challenge));
const groups = computed(() => {
  const grouped = new Map<string, PublicAchievement[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), challenge]);
  return [...grouped.entries()]
    .map(([category, challenges], index) => ({
      category,
      anchor: `series-${index}`,
      obtained: props.titles ? challenges.filter((challenge) => stateOf(challenge) !== "none").length : null,
      challenges: [...challenges].sort((left, right) => left.titleName.localeCompare(right.titleName, "zh-CN")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
});
</script>

<template>
  <div v-if="groups.length" class="catalog">
    <nav class="series-index" aria-label="成就系列">
      <p class="series-index__label font-display">SERIES</p>
      <a v-for="group in groups" :key="group.anchor" :href="`#${group.anchor}`" class="series-index__link">
        <span>{{ group.category }}</span>
        <span class="num">{{ group.obtained === null ? group.challenges.length : `${group.obtained}/${group.challenges.length}` }}</span>
      </a>
    </nav>

    <div class="series-list">
      <section v-for="group in groups" :id="group.anchor" :key="group.anchor" class="series" :aria-labelledby="`${group.anchor}-title`">
        <header class="series__head">
          <h2 :id="`${group.anchor}-title`" class="type-headline">{{ group.category }}</h2>
          <span class="series__count num">{{ group.obtained === null ? `${group.challenges.length} 项` : `已获得 ${group.obtained} / ${group.challenges.length}` }}</span>
          <span v-if="group.obtained !== null" class="series__progress" aria-hidden="true"><i :style="{ width: `${(group.obtained / group.challenges.length) * 100}%` }" /></span>
        </header>
        <ul class="badge-grid">
          <li
            v-for="challenge in group.challenges"
            :key="challenge.challengeId"
            class="badge"
            :class="{ 'is-locked': titles && stateOf(challenge) === 'none', 'is-owned': titles && stateOf(challenge) !== 'none', 'is-scheduled': challenge.status === 'scheduled' }"
          >
            <span class="badge__icon" aria-hidden="true">
              <img v-if="challenge.iconUrl" :src="challenge.iconUrl" alt="" />
              <UIcon v-else :name="`i-lucide-${challenge.icon}`" />
            </span>
            <strong class="badge__title">{{ challenge.titleName }}</strong>
            <span class="badge__condition">{{ challenge.condition }}</span>
            <span class="badge__foot">
              <AchievementStatus v-if="titles" :state="stateOf(challenge)" />
              <span v-if="challenge.status === 'scheduled'" class="badge__note">未开放</span>
              <span v-else-if="challenge.status === 'sunsetting'" class="badge__sunset"><StatusBadge label="即将结束" tone="warning" /><small class="num">{{ challenge.retiredVersion }}</small></span>
            </span>
          </li>
        </ul>
      </section>
    </div>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.catalog { display: grid; gap: var(--space-8); }
.series-index { display: none; }
.series-list { display: grid; gap: var(--space-12); min-width: 0; }
.series { display: grid; gap: var(--space-5); scroll-margin-top: var(--sticky-chrome-top); }
.series__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); }
.series__head h2 { margin: 0; }
.series__count { color: var(--quiet); font-size: var(--type-label-sm-size); }
.series__progress { flex: 1 1 100%; height: 3px; overflow: hidden; background: var(--line); }
.series__progress i { display: block; height: 100%; background: var(--accent); }
.badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.badge { position: relative; display: grid; grid-template-rows: auto auto 1fr auto; justify-items: center; gap: var(--space-2); padding: var(--space-6) var(--space-4) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); text-align: center; }
.badge__icon { display: grid; width: 5rem; height: 5rem; margin-bottom: var(--space-2); place-items: center; color: var(--accent); font-size: 2rem; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: radial-gradient(circle at 50% 35%, color-mix(in oklch, var(--accent) 22%, transparent), transparent 70%), var(--surface-raised); }
.badge__icon img { width: 62%; height: 62%; object-fit: contain; }
.badge__title { color: var(--text); font-size: 1rem; font-weight: 600; overflow-wrap: anywhere; }
.badge__condition { color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.55; }
.badge__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--space-2); min-height: 1.5rem; }
.badge__note, .badge__sunset small { color: var(--quiet); font-size: var(--type-caption-size); }
.badge__sunset { display: inline-flex; align-items: center; gap: var(--space-2); }
.badge.is-owned { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); }
.badge.is-owned .badge__icon { background: radial-gradient(circle at 50% 35%, color-mix(in oklch, var(--accent) 45%, transparent), transparent 75%), var(--accent-surface); }
.badge.is-locked .badge__icon { color: var(--quiet); filter: grayscale(1); opacity: .55; }
.badge.is-scheduled { border-style: dashed; }

@container (min-width: 56rem) {
  .catalog { grid-template-columns: 12rem minmax(0, 1fr); align-items: start; }
  .series-index { position: sticky; top: var(--sticky-chrome-top); display: grid; gap: 2px; }
  .series-index__label { margin: 0 0 var(--space-2); color: var(--quiet); font-size: var(--type-caption-size); letter-spacing: .14em; }
  .series-index__link { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-left: 2px solid var(--line); color: var(--muted); font-size: var(--type-label-sm-size); text-decoration: none; }
  .series-index__link:hover, .series-index__link:focus-visible { border-left-color: var(--accent); color: var(--text); }
  .series-index__link .num { color: var(--quiet); }
}
</style>
