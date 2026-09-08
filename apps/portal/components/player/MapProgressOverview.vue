<script setup lang="ts">
import type { PlayerMasteryMapProfile, PortalMap } from "~/composables/usePortalApi";
import type { OwnedTitle } from "~/types/title";
import { buildMapProgressRows, type MapProgressChallenge } from "~/utils/map-progress";

const props = withDefaults(defineProps<{
  maps: PortalMap[];
  challenges: MapProgressChallenge[];
  titles: OwnedTitle[];
  profiles?: PlayerMasteryMapProfile[];
  showMasteryFacts?: boolean;
  showTargets?: boolean;
  titleProgressAvailable?: boolean;
}>(), {
  profiles: () => [],
  showMasteryFacts: true,
  showTargets: false,
  titleProgressAvailable: true,
});

const rows = computed(() => buildMapProgressRows({
  maps: props.maps,
  challenges: props.challenges,
  titles: props.titles,
  profiles: props.profiles,
}));
const targetMapCount = computed(() => rows.value.filter((row) => row.challenges.length).length);
const totalChallengeCount = computed(() => rows.value.reduce((count, row) => count + row.challenges.length, 0));
const earnedChallengeCount = computed(() => rows.value.reduce((count, row) => count + row.earnedChallenges.length, 0));
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
const isComplete = (row: (typeof rows.value)[number]) => props.titleProgressAvailable && row.challenges.length > 0 && row.earnedChallenges.length === row.challenges.length;
const statusLabel = (row: (typeof rows.value)[number]) => {
  if (!row.challenges.length) return "暂无地图成就";
  if (!props.titleProgressAvailable) return "称号进度暂不可用";
  if (props.showTargets) {
    if (isComplete(row)) return "已完成";
    return `已获得 ${row.earnedChallenges.length} / ${row.challenges.length}`;
  }
  return `地图称号 ${row.earnedChallenges.length} / ${row.challenges.length}`;
};
const isEarned = (row: (typeof rows.value)[number], challenge: MapProgressChallenge) => row.earnedChallenges.some((item) => item.challengeId === challenge.challengeId);
</script>

<template>
  <div v-if="rows.length" class="map-progress-overview">
    <p v-if="showTargets && targetMapCount" class="map-progress-summary" aria-live="polite">已获得 {{ earnedChallengeCount }} / {{ totalChallengeCount }} 个地图成就</p>
    <ul class="map-progress-list">
      <li v-for="row in rows" :key="row.map.mapId" class="map-progress-item">
        <article class="map-progress-card">
          <NuxtLink to="/maps" class="map-progress-link interactive-card pressable-soft" :aria-label="`查看${row.map.mapName}详情`">
            <div class="map-progress-heading">
              <h3 :id="`map-progress-${row.map.mapId}`">{{ row.map.mapName }}</h3>
              <span class="map-progress-status" :class="{ complete: isComplete(row) }">{{ statusLabel(row) }}</span>
            </div>
          </NuxtLink>

          <ul v-if="showTargets && row.challenges.length" class="map-target-list" :aria-labelledby="`map-progress-${row.map.mapId}`">
            <li v-for="challenge in row.challenges" :key="challenge.challengeId" :class="{ earned: isEarned(row, challenge) }">
              <span class="state-marker" aria-hidden="true">{{ isEarned(row, challenge) ? "✓" : "○" }}</span>
              <span>{{ challenge.name }}<small v-if="challenge.status === 'sunsetting'">即将结束</small></span>
              <span v-if="isEarned(row, challenge)" class="sr-only">已获得</span>
              <span v-else class="sr-only">未获得</span>
            </li>
          </ul>

          <dl v-if="showMasteryFacts && row.profile" class="detail-list mastery-facts">
            <div><dt>精通 XP</dt><dd>{{ row.profile.totalXp }} XP</dd></div>
            <div><dt>已验证通关</dt><dd>{{ row.profile.verifiedRunCount }} 次</dd></div>
            <div><dt>最高难度</dt><dd>{{ row.profile.highestCompletedDifficulty ?? "暂无记录" }}</dd></div>
            <div v-if="row.profile.recentRuns[0]"><dt>最近记录</dt><dd>{{ formatDate(row.profile.recentRuns[0].acceptedAt) }}</dd></div>
          </dl>
          <span v-else-if="showMasteryFacts && row.challenges.length" class="mastery-empty">暂无精通记录</span>
        </article>
      </li>
    </ul>
  </div>
  <UEmpty v-else title="暂无地图" variant="naked" />
</template>

<style scoped>
.map-progress-overview { display: grid; gap: 1rem; }
.map-progress-summary { margin: 0; color: var(--muted); font-size: var(--type-caption-size); }
.map-progress-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin: 0; padding: 0; list-style: none; }
.map-progress-item { min-width: 0; }
.map-progress-card { display: grid; gap: .85rem; min-width: 0; padding: 1.125rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); }
.map-progress-link { display: block; min-width: 0; padding: 0 0 .85rem; border-width: 0 0 1px; border-radius: 0; background: transparent; }
.map-progress-heading { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; min-width: 0; }
.map-progress-heading h3 { min-width: 0; margin: 0; color: var(--text); overflow-wrap: anywhere; }
.map-progress-status, .mastery-empty { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
.map-progress-status { flex: 0 0 auto; }
.map-progress-status.complete { color: var(--success); }
.state-marker { flex: 0 0 auto; font-size: 1rem; font-weight: 800; line-height: 1; }
.map-target-list { display: grid; gap: .4rem; margin: 0; padding: .75rem 0 0; border-top: 1px solid var(--line); list-style: none; color: var(--muted); font-size: var(--type-caption-size); }
.map-target-list li { display: grid; grid-template-columns: 1rem minmax(0, 1fr); align-items: start; gap: .5rem; min-width: 0; }
.map-target-list li.earned { color: var(--text); }
.map-target-list small { display: block; color: var(--quiet); font-size: .72rem; }
.mastery-facts { padding-top: .75rem; border-top: 1px solid var(--line); }
@media (prefers-contrast: more) { .map-progress-card { border-color: var(--text); } }
@media (max-width: 760px) { .map-progress-list { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .map-progress-heading { align-items: flex-start; flex-direction: column; gap: .4rem; } }
</style>
