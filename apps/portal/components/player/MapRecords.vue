<script setup lang="ts">
import type { PlayerMasteryMapProfile } from "~/composables/usePortalApi";
import { formatMasteryDuration } from "~/utils/mastery";

const props = defineProps<{ profiles: PlayerMasteryMapProfile[]; mapNames: Map<string, string>; limit?: number }>();

// Current progress only: historical gameplay revisions belong to the map detail history.
const records = computed(() => props.profiles
  .filter((profile) => profile.gameplayRevisionLifecycle === "default" && profile.verifiedRunCount > 0)
  .map((profile) => ({
    profile,
    name: props.mapNames.get(profile.mapId) ?? "地图",
    fastest: profile.difficultyStats.length ? Math.min(...profile.difficultyStats.map((stat) => stat.fastestCompletionSeconds)) : null,
  }))
  .sort((left, right) => right.profile.totalXp - left.profile.totalXp)
  .slice(0, props.limit ?? 6));
</script>

<template>
  <ul v-if="records.length" class="map-records">
    <li v-for="record in records" :key="record.profile.mapId">
      <NuxtLink :to="`/maps?mapId=${encodeURIComponent(record.profile.mapId)}`" class="map-record surface-card interactive-card pressable-soft" :aria-label="`查看${record.name}详情`">
        <div class="map-record__head">
          <strong class="card-heading">{{ record.name }}</strong>
          <span v-if="record.profile.highestCompletedDifficulty" class="map-record__difficulty">{{ record.profile.highestCompletedDifficulty }}</span>
        </div>
        <dl class="map-record__facts">
          <div><dt>最快</dt><dd class="num">{{ record.fastest === null ? "—" : formatMasteryDuration(record.fastest) }}</dd></div>
          <div><dt>最少死亡</dt><dd class="num">{{ record.profile.lowestDeaths ?? "—" }}</dd></div>
          <div><dt>精通 XP</dt><dd class="num">{{ record.profile.totalXp }}</dd></div>
        </dl>
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.map-records { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.map-records > li { min-width: 0; }
.map-record { display: grid; gap: var(--space-4); min-width: 0; padding: var(--space-4); color: inherit; text-decoration: none; }
.map-record__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-width: 0; }
.map-record__head strong { min-width: 0; overflow-wrap: anywhere; }
.map-record__difficulty { flex: 0 0 auto; padding: 0 var(--space-3); border-radius: var(--radius-pill); color: var(--accent); background: var(--accent-surface); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.8; }
.map-record__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
.map-record__facts dt { color: var(--muted); font-size: var(--type-caption-size); }
.map-record__facts dd { margin: 0; color: var(--text); font-size: var(--type-label-size); font-weight: 600; }
</style>
