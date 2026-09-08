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
}>(), {
  profiles: () => [],
  showMasteryFacts: true,
  showTargets: false,
});

const rows = computed(() => buildMapProgressRows({
  maps: props.maps,
  challenges: props.challenges,
  titles: props.titles,
  profiles: props.profiles,
}));
const targetMapCount = computed(() => rows.value.filter((row) => row.challenges.length).length);
const completedMapCount = computed(() => rows.value.filter((row) => row.challenges.length > 0 && row.earnedChallenges.length === row.challenges.length).length);
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
const statusLabel = (row: (typeof rows.value)[number]) => {
  if (!row.challenges.length) return "暂无地图成就";
  if (row.earnedChallenges.length === row.challenges.length) return "已完成";
  if (row.earnedChallenges.length) return `已完成 ${row.earnedChallenges.length} / ${row.challenges.length}`;
  return "未完成";
};
const isEarned = (row: (typeof rows.value)[number], challenge: MapProgressChallenge) => row.earnedChallenges.some((item) => item.challengeId === challenge.challengeId);
</script>

<template>
  <div v-if="rows.length" class="map-progress-overview">
    <p v-if="showTargets && targetMapCount" class="map-progress-summary" aria-live="polite">已完成 {{ completedMapCount }} / {{ targetMapCount }}</p>
    <ul class="map-progress-list">
      <li v-for="row in rows" :key="row.map.mapId" class="map-progress-item">
        <NuxtLink :to="`/maps?mapId=${encodeURIComponent(row.map.mapId)}`" class="map-progress-card interactive-card pressable-soft">
          <div class="map-progress-heading">
            <strong>{{ row.map.mapName }}</strong>
            <span class="map-progress-status" :class="{ complete: row.challenges.length > 0 && row.earnedChallenges.length === row.challenges.length }">{{ statusLabel(row) }}</span>
          </div>

          <ul v-if="showTargets && row.challenges.length" class="map-target-list" aria-label="地图成就目标">
            <li v-for="challenge in row.challenges" :key="challenge.challengeId" :class="{ earned: isEarned(row, challenge) }">
              <span class="state-marker" aria-hidden="true">{{ isEarned(row, challenge) ? "✓" : "○" }}</span>
              <span>{{ challenge.name }}</span>
              <span v-if="isEarned(row, challenge)" class="sr-only">已获得</span>
              <span v-else class="sr-only">未获得</span>
            </li>
          </ul>

          <dl v-if="showMasteryFacts && row.profile" class="mastery-facts">
            <div><dt>精通 XP</dt><dd>{{ row.profile.totalXp }}</dd></div>
            <div><dt>已验证通关</dt><dd>{{ row.profile.verifiedRunCount }} 次</dd></div>
            <div><dt>最高难度</dt><dd>{{ row.profile.highestCompletedDifficulty ?? "暂无记录" }}</dd></div>
            <div v-if="row.profile.recentRuns[0]"><dt>最近记录</dt><dd>{{ formatDate(row.profile.recentRuns[0].acceptedAt) }}</dd></div>
          </dl>
          <span v-else-if="showMasteryFacts" class="mastery-empty">暂无通关记录</span>
        </NuxtLink>
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
.map-progress-card { display: grid; gap: .85rem; min-width: 0; height: 100%; padding: 1.125rem; border-radius: 1rem; text-decoration: none; }
.map-progress-heading { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; min-width: 0; }
.map-progress-heading strong { min-width: 0; color: var(--text); letter-spacing: var(--type-headline-tracking); overflow-wrap: anywhere; }
.map-progress-status, .mastery-empty { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
.map-progress-status.complete { color: var(--success); }
.state-marker { flex: 0 0 auto; font-size: 1rem; font-weight: 800; line-height: 1; }
.map-target-list { display: grid; gap: .4rem; margin: 0; padding: .75rem 0 0; border-top: 1px solid var(--line); list-style: none; color: var(--muted); font-size: var(--type-caption-size); }
.map-target-list li { display: grid; grid-template-columns: 1rem minmax(0, 1fr); align-items: start; gap: .5rem; min-width: 0; }
.map-target-list li.earned { color: var(--text); }
.mastery-facts { display: grid; gap: .5rem; margin: 0; padding-top: .75rem; border-top: 1px solid var(--line); }
.mastery-facts > div { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; }
.mastery-facts dt { color: var(--muted); font-size: var(--type-caption-size); }
.mastery-facts dd { margin: 0; color: var(--text); font-size: var(--type-caption-size); font-weight: 650; text-align: right; }
@media (max-width: 760px) { .map-progress-list { grid-template-columns: 1fr; } }
@media (max-width: 360px) { .map-progress-heading { align-items: flex-start; flex-direction: column; gap: .4rem; }.mastery-facts > div { align-items: flex-start; flex-direction: column; gap: .2rem; }.mastery-facts dd { text-align: left; } }
</style>
