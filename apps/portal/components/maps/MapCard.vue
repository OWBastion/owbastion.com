<script setup lang="ts">
import type { Map, MapChallenge } from "~/types/challenge";
import type { ReviewSummary } from "~/composables/usePlayerReview";

const props = defineProps<{
  map: Map;
  challenges: MapChallenge[];
  reviewSummary: ReviewSummary | null;
  reviewLoading: boolean;
  reviewError?: string;
}>();

const emit = defineEmits<{ select: [] }>();

const mapChallenges = computed(() => props.challenges.filter((challenge) => challenge.mapId === props.map.mapId));
const mechanics = computed(() => props.map.mechanics ?? []);
const reviewBadge = computed(() => reviewRatingChip(props.reviewSummary, props.reviewLoading, props.reviewError));
const mapIndex = computed(() => props.map.mapId.split(".").at(-1)?.slice(0, 2).toUpperCase() ?? "地图");
// "T1".."T5": the digit drives the tier colour ramp; anything else renders neutral.
const tier = computed(() => Number(/^T(\d)$/.exec(props.map.difficultyRating ?? "")?.[1] ?? 0));
</script>

<template>
  <button class="map-card interactive-card pressable-soft" type="button" :aria-label="`查看${map.mapName}详情`" aria-haspopup="dialog" @click="emit('select')">
    <div class="map-card-media">
      <img v-if="map.coverUrl" :src="map.coverUrl" alt="" />
      <span v-else class="map-card-index" aria-hidden="true">{{ mapIndex }}</span>
      <span class="map-card-shade" aria-hidden="true" />
      <span class="map-card-tier num" :data-tier="tier" aria-hidden="true">{{ map.difficultyRating ?? "—" }}</span>
      <span class="map-card-name">
        <strong>{{ map.mapName }}</strong>
        <small class="num">{{ map.gameVersion }}</small>
      </span>
    </div>
    <div class="map-card-body">
      <dl class="map-card-stats">
        <div><dt>地图评级</dt><dd class="num" :class="{ quiet: map.difficultyRating == null }">{{ map.difficultyRating ?? "暂无记录" }}</dd></div>
        <div><dt>挑战</dt><dd class="num" :class="{ quiet: !mapChallenges.length }">{{ mapChallenges.length ? `${mapChallenges.length} 项` : "暂无记录" }}</dd></div>
      </dl>
      <StatusBadge v-bind="reviewBadge" />
      <div v-if="mechanics.length" class="map-card-tags"><UBadge v-for="mechanic in mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" /></div>
    </div>
  </button>
</template>

<style scoped>
.map-card { container-type: inline-size; display: grid; grid-template-rows: auto 1fr; min-width: 0; padding: 0; overflow: hidden; border-radius: var(--radius-card); font: inherit; text-align: left; }
.map-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.map-card-media { position: relative; display: grid; place-items: center; aspect-ratio: 16 / 9; overflow: hidden; color: var(--accent); background: repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in oklch, var(--accent) 7%, transparent) 10px 11px), radial-gradient(80% 90% at 70% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 70%), var(--surface-raised); }
.map-card-media img { width: 100%; height: 100%; object-fit: cover; transition: transform 300ms cubic-bezier(.2, .7, .2, 1); }
.map-card:hover .map-card-media img { transform: scale(1.04); }
.map-card-index { font-family: var(--font-display); font-size: clamp(3rem, 26cqi, 6rem); font-weight: 700; letter-spacing: .04em; opacity: .22; }
.map-card-shade { position: absolute; inset: 40% 0 0; background: linear-gradient(to bottom, transparent, oklch(12% 0.01 165 / 85%)); }
.map-card-name { position: absolute; inset: auto var(--space-4) var(--space-3); display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); color: oklch(97% 0.01 120); }
.map-card-name strong { min-width: 0; overflow: hidden; font-family: var(--font-display); font-size: clamp(1.125rem, 7cqi, 1.5rem); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.map-card-name small { flex: none; opacity: .7; font-size: var(--type-caption-size); }
.map-card-tier { position: absolute; top: var(--space-3); right: var(--space-3); min-width: 2.5rem; padding: .15rem .5rem; border-radius: calc(var(--radius-control) / 1.5); color: oklch(15% 0.02 150); background: oklch(80% 0.02 150); font-size: .8125rem; font-weight: 700; text-align: center; }
.map-card-tier[data-tier="1"] { background: oklch(85% 0.17 135); }
.map-card-tier[data-tier="2"] { background: oklch(86% 0.16 110); }
.map-card-tier[data-tier="3"] { background: oklch(84% 0.15 80); }
.map-card-tier[data-tier="4"] { background: oklch(76% 0.16 55); }
.map-card-tier[data-tier="5"] { color: oklch(98% 0.01 30); background: oklch(62% 0.2 28); }
.map-card-body { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-4); }
.map-card-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.map-card-stats dt { color: var(--quiet); font-size: var(--type-caption-size); }
.map-card-stats dd { margin: 0; color: var(--text); font-weight: 600; }
.map-card-stats dd.quiet { color: var(--quiet); font-weight: 500; }
.map-card-tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
@media (prefers-reduced-motion: reduce) { .map-card-media img { transition: none; } }
</style>
