<script setup lang="ts">
import type { PlayerMasteryMapProfile } from "~/composables/usePortalApi";
import type { MapProgressChallenge } from "~/utils/map-progress";
import { formatMasteryDuration } from "~/utils/mastery";

const props = withDefaults(defineProps<{
  variant: "record" | "progress" | "detail";
  mapName?: string;
  profile?: PlayerMasteryMapProfile | null;
  to?: string;
  challenges?: MapProgressChallenge[];
  earnedChallenges?: MapProgressChallenge[];
  authenticated?: boolean;
  loading?: boolean;
  error?: string;
}>(), {
  mapName: "",
  profile: null,
  to: undefined,
  challenges: () => [],
  earnedChallenges: () => [],
  authenticated: true,
  loading: false,
  error: "",
});
const emit = defineEmits<{ retry: [] }>();

const NuxtLink = resolveComponent("NuxtLink");
const id = useId();

const earnedIds = computed(() => new Set(props.earnedChallenges.map((challenge) => challenge.challengeId)));
const complete = computed(() => props.challenges.length > 0 && props.earnedChallenges.length === props.challenges.length);
const status = computed(() => {
  if (!props.challenges.length) return "暂无地图成就";
  return complete.value ? "已完成" : `已获得 ${props.earnedChallenges.length} / ${props.challenges.length}`;
});

const empty = (value: string | number | null | undefined, unit = "") => value == null ? "暂无记录" : `${value}${unit}`;
const stats = computed(() => {
  const profile = props.profile;
  if (!profile) return [];
  if (props.variant === "record") {
    const fastest = profile.difficultyStats.length ? Math.min(...profile.difficultyStats.map((stat) => stat.fastestCompletionSeconds)) : null;
    return [
      { label: "最快", value: fastest === null ? "—" : formatMasteryDuration(fastest) },
      { label: "最少死亡", value: String(profile.lowestDeaths ?? "—") },
      { label: "精通 XP", value: String(profile.totalXp) },
    ];
  }
  return [
    { label: "精通 XP", value: `${profile.totalXp} XP` },
    { label: "已验证通关", value: `${profile.verifiedRunCount} 次` },
    { label: "最高难度", value: empty(profile.highestCompletedDifficulty) },
    { label: "最低死亡", value: empty(profile.lowestDeaths) },
    { label: "最少跳过", value: empty(profile.fewestSkips) },
    { label: "单次最高 XP", value: empty(profile.highestSingleRunXp, " XP") },
  ];
});
const linkLabel = computed(() => `查看${props.mapName}详情`);
</script>

<template>
  <component
    :is="variant === 'record' ? NuxtLink : variant === 'detail' ? 'section' : 'article'"
    class="mastery-card"
    :class="[`mastery-card--${variant}`, { 'surface-card interactive-card pressable-soft': variant === 'record', 'detail-section': variant === 'detail' }]"
    v-bind="variant === 'record' ? { to, 'aria-label': linkLabel } : variant === 'detail' ? { 'aria-labelledby': `mastery-title-${id}` } : {}"
  >
    <template v-if="variant === 'detail'">
      <div class="section-title"><h3 :id="`mastery-title-${id}`">精通记录</h3></div>
      <p v-if="!authenticated" class="muted-copy">登录后查看</p>
      <div v-else-if="loading" class="mastery-card__loading" role="status" aria-label="读取精通记录…"><USkeleton /><USkeleton /><USkeleton /></div>
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取精通记录" :description="error">
        <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="emit('retry')" /></template>
      </UAlert>
      <template v-else>
        <UEmpty v-if="!profile" title="暂无精通记录" variant="naked" />
        <template v-else>
          <dl class="mastery-stats"><div v-for="stat in stats" :key="stat.label"><dt>{{ stat.label }}</dt><dd>{{ stat.value }}</dd></div></dl>
          <div class="difficulty-summary" aria-label="各难度通关记录"><div v-for="stat in profile.difficultyStats" :key="stat.difficulty" class="content-stack"><strong>{{ stat.difficulty }}</strong><span>{{ stat.verifiedRunCount }} 次 · 最快 {{ formatMasteryDuration(stat.fastestCompletionSeconds) }}</span></div></div>
        </template>
        <slot />
      </template>
    </template>

    <template v-else>
      <component :is="variant === 'progress' && to ? NuxtLink : 'div'" class="mastery-card__head" v-bind="variant === 'progress' && to ? { to, 'aria-label': linkLabel, class: 'interactive-card pressable-soft' } : {}">
        <strong :id="`mastery-name-${id}`" class="card-heading">{{ mapName }}</strong>
        <span v-if="variant === 'record' && profile?.highestCompletedDifficulty" class="mastery-card__pill">{{ profile.highestCompletedDifficulty }}</span>
        <span v-else-if="variant === 'progress'" class="mastery-card__status" :class="{ complete }">{{ status }}</span>
      </component>
      <dl v-if="variant === 'record' && stats.length" class="mastery-stats"><div v-for="stat in stats" :key="stat.label"><dt>{{ stat.label }}</dt><dd class="num">{{ stat.value }}</dd></div></dl>
      <ul v-if="variant === 'progress' && challenges.length" class="mastery-card__targets" :aria-labelledby="`mastery-name-${id}`">
        <li v-for="challenge in challenges" :key="challenge.challengeId" :class="{ earned: earnedIds.has(challenge.challengeId) }">
          <span class="state-marker" aria-hidden="true">{{ earnedIds.has(challenge.challengeId) ? "✓" : "○" }}</span>
          <span>{{ challenge.name }}<small v-if="challenge.status === 'sunsetting'">即将结束</small></span>
          <span class="sr-only">{{ earnedIds.has(challenge.challengeId) ? "已获得" : "未获得" }}</span>
        </li>
      </ul>
    </template>
  </component>
</template>

<style scoped>
.mastery-card { container-type: inline-size; display: grid; gap: var(--space-4); min-width: 0; color: inherit; text-decoration: none; }
.mastery-card--record { padding: var(--space-4); }
.mastery-card--progress { gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.mastery-card__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); min-width: 0; }
.mastery-card--record .mastery-card__head { align-items: center; }
.mastery-card--progress .mastery-card__head { display: flex; padding: 0 0 var(--space-3); border-width: 0 0 1px; border-radius: 0; background: transparent; }
.mastery-card__head strong { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.mastery-card__pill { flex: 0 0 auto; padding: 0 var(--space-3); border-radius: var(--radius-pill); color: var(--accent); background: var(--accent-surface); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.8; }
.mastery-card__status { flex: 0 0 auto; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.mastery-card__status.complete { color: var(--success); }
.mastery-card__loading { display: grid; gap: var(--space-2); }
.mastery-card__loading > * { height: 44px; border-radius: var(--radius-control); }
.mastery-card__targets { display: grid; gap: var(--space-2); margin: 0; padding: var(--space-3) 0 0; border-top: 1px solid var(--line); list-style: none; color: var(--muted); font-size: var(--type-caption-size); }
.mastery-card__targets li { display: grid; grid-template-columns: 1rem minmax(0, 1fr); align-items: start; gap: var(--space-2); min-width: 0; }
.mastery-card__targets li.earned { color: var(--text); }
.mastery-card__targets small { display: block; color: var(--quiet); font-size: .72rem; }
.state-marker { flex: 0 0 auto; font-size: 1rem; font-weight: 700; line-height: 1; }
.mastery-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 var(--space-4); margin: 0; }
.mastery-stats > div { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-width: 0; padding: var(--space-2) 0; border-top: 1px solid var(--line); }
.mastery-stats dt { color: var(--muted); font-size: .76rem; }
.mastery-stats dd { margin: 0; color: var(--text); font-size: .8rem; font-weight: 700; text-align: right; }
.mastery-card--record .mastery-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.mastery-card--record .mastery-stats > div { display: block; padding: 0; border-top: 0; }
.mastery-card--record .mastery-stats dt { font-size: var(--type-caption-size); }
.mastery-card--record .mastery-stats dd { font-size: var(--type-label-size); font-weight: 600; text-align: left; }
.difficulty-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.difficulty-summary > div { padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface-raised); }
.difficulty-summary strong { color: var(--text); font-size: .8rem; }
.difficulty-summary span { color: var(--quiet); font-size: .72rem; overflow-wrap: anywhere; }
/* Detail: big-number tiles and a difficulty strip. */
.mastery-card--detail .section-title h3 { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.mastery-card--detail .mastery-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.mastery-card--detail .mastery-stats > div { display: grid; flex-direction: column-reverse; gap: 2px; padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface-raised); }
.mastery-card--detail .mastery-stats dt { order: 2; font-size: var(--type-caption-size); }
.mastery-card--detail .mastery-stats dd { order: 1; font-family: var(--font-display); font-size: 1.375rem; text-align: left; }
.mastery-card--detail .difficulty-summary { grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); }
.mastery-card--detail .difficulty-summary > div { border-left: 3px solid var(--accent); }
@media (prefers-contrast: more) { .mastery-card--progress { border-color: var(--text); } }
@container (max-width: 23.99rem) {
  .mastery-card--progress .mastery-card__head { align-items: flex-start; flex-direction: column; gap: var(--space-2); }
  .mastery-card--detail .mastery-stats, .difficulty-summary { grid-template-columns: 1fr; }
}
</style>
