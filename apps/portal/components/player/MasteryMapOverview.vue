<script setup lang="ts">
import type { PlayerMasteryMapProfile } from "~/composables/usePortalApi";

const props = defineProps<{
  profiles: PlayerMasteryMapProfile[];
  mapNames: Record<string, string>;
}>();

const visibleProfiles = computed(() => [...props.profiles]
  .sort((left, right) => right.verifiedRunCount - left.verifiedRunCount || right.totalXp - left.totalXp || left.mapId.localeCompare(right.mapId))
  .slice(0, 4));
const mapName = (mapId: string) => props.mapNames[mapId] ?? mapId;
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
</script>

<template>
  <div v-if="visibleProfiles.length" class="mastery-overview">
    <NuxtLink v-for="profile in visibleProfiles" :key="profile.mapId" :to="`/maps?mapId=${encodeURIComponent(profile.mapId)}`" class="mastery-map interactive-card pressable-soft">
      <div class="mastery-map-heading"><strong>{{ mapName(profile.mapId) }}</strong><span>{{ profile.totalXp }} XP</span></div>
      <dl class="mastery-map-facts">
        <div><dt>已验证通关</dt><dd>{{ profile.verifiedRunCount }} 次</dd></div>
        <div><dt>最高难度</dt><dd>{{ profile.highestCompletedDifficulty ?? "暂无记录" }}</dd></div>
        <div v-if="profile.recentRuns[0]"><dt>最近记录</dt><dd>{{ formatDate(profile.recentRuns[0].acceptedAt) }}</dd></div>
      </dl>
    </NuxtLink>
  </div>
  <UEmpty v-else title="暂无精通记录" description="尚无已验证通关。" variant="naked" />
</template>

<style scoped>
.mastery-overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.mastery-map { display: grid; min-width: 0; gap: 15px; padding: 18px; border-radius: 16px; text-decoration: none; }
.mastery-map:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.mastery-map-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; }
.mastery-map-heading strong { min-width: 0; overflow: hidden; color: var(--text); letter-spacing: var(--type-headline-tracking); text-overflow: ellipsis; white-space: nowrap; }
.mastery-map-heading span { flex: 0 0 auto; color: var(--accent); font-size: .84rem; font-weight: 750; }
.mastery-map-facts { display: grid; gap: 8px; margin: 0; }
.mastery-map-facts > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
.mastery-map-facts dt { color: var(--muted); font-size: .75rem; }
.mastery-map-facts dd { margin: 0; color: var(--text); font-size: .78rem; font-weight: 650; text-align: right; }
@media (max-width: 700px) { .mastery-overview { grid-template-columns: 1fr; }.mastery-map { padding: 16px; } }
@media (max-width: 360px) { .mastery-map-heading, .mastery-map-facts > div { align-items: flex-start; flex-direction: column; gap: 6px; }.mastery-map-facts dd { text-align: left; } }
</style>
