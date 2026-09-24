<script setup lang="ts">
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";
import type { ReviewSummary } from "~/composables/usePlayerReview";
import type { PlayerMasteryMapProfile } from "~/composables/usePortalApi";
import ReviewSummaryBadge from "~/components/reviews/ReviewSummaryBadge.vue";

const props = defineProps<{
  map: Map;
  challenges: MapChallenge[];
  authenticated: boolean;
  reviewSummary: ReviewSummary | null;
  reviewLoading: boolean;
  reviewError?: string;
  masteryProfile: PlayerMasteryMapProfile | null;
  masteryLoading: boolean;
  masteryError?: string;
}>();

const emit = defineEmits<{ select: [] }>();

const mapChallenges = computed(() => props.challenges.filter((challenge) => challenge.mapId === props.map.mapId));
const mechanics = computed(() => props.map.mechanics ?? []);
const mapIndex = computed(() => props.map.mapId.split(".").at(-1)?.slice(0, 2).toUpperCase() ?? "地图");
</script>

<template>
  <button class="map-card interactive-card pressable-soft" type="button" :aria-label="`查看${map.mapName}详情`" aria-haspopup="dialog" @click="emit('select')">
    <div class="map-card-media" aria-hidden="true"><img v-if="map.coverUrl" :src="map.coverUrl" alt="" /><span v-else>{{ mapIndex }}</span></div>
    <div class="map-card-body">
      <div class="map-card-heading"><h2 class="type-card-title">{{ map.mapName }}</h2><span class="type-caption">{{ map.gameVersion }}</span></div>
      <ReviewSummaryBadge :summary="reviewSummary" :loading="reviewLoading" :error="reviewError" />
      <dl class="map-card-stats">
        <div><dt class="type-label-sm">地图评级</dt><dd class="type-label" :class="{ quiet: map.difficultyRating == null }">{{ map.difficultyRating ?? "暂无记录" }}</dd></div>
        <div><dt class="type-label-sm">精通</dt><dd v-if="!authenticated" class="type-label quiet">登录后查看</dd><dd v-else-if="masteryLoading" class="type-label quiet">读取中…</dd><dd v-else-if="masteryProfile" class="type-label">{{ masteryProfile.totalXp }} XP · {{ masteryProfile.verifiedRunCount }} 次</dd><dd v-else-if="masteryError" class="type-label quiet">暂不可用</dd><dd v-else class="type-label quiet">暂无记录</dd></div>
        <div><dt class="type-label-sm">挑战</dt><dd class="type-label" :class="{ quiet: !mapChallenges.length }">{{ mapChallenges.length ? `${mapChallenges.length} 项` : "暂无记录" }}</dd></div>
      </dl>
      <div v-if="mechanics.length" class="map-card-tags"><UBadge v-for="mechanic in mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" /></div>
    </div>
  </button>
</template>

<style scoped>
.map-card { container-type: inline-size; display: grid; grid-template-rows: auto 1fr; min-width: 0; padding: 0; overflow: hidden; border-radius: var(--radius-card); font: inherit; text-align: left; }
.map-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.map-card-media { display: grid; place-items: center; aspect-ratio: 16 / 9; overflow: hidden; color: var(--accent); background: var(--accent-surface); }
.map-card-media img { width: 100%; height: 100%; object-fit: cover; }
.map-card-media span { font-size: var(--type-label-size); font-weight: 600; letter-spacing: 0.14em; }
.map-card-body { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-4); }
.map-card-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.map-card-heading h2 { min-width: 0; overflow-wrap: anywhere; color: var(--text); }
.map-card-heading span { flex: none; font-variant-numeric: tabular-nums; }
.map-card-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding-top: var(--space-3); border-top: 1px solid var(--line); }
.map-card-stats > div { display: grid; align-content: start; gap: var(--space-1); min-width: 0; }
.map-card-stats dt, .map-card-stats dd { margin: 0; overflow-wrap: anywhere; }
.map-card-stats dd.quiet { color: var(--quiet); font-weight: 500; }
.map-card-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@container (max-width: 23.99rem) {
  .map-card-media { aspect-ratio: 2 / 1; }
  .map-card-body { padding: var(--space-3); }
}
</style>
