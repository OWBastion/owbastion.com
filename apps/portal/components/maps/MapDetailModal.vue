<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";
import PlayerReviewPanel from "../reviews/PlayerReviewPanel.vue";
import MapMasteryProfile from "./MapMasteryProfile.vue";
import type { CurrentPlayerMasteryResponse, PlayerMasteryMapProfile } from "~/composables/usePortalApi";

const props = defineProps<{
  map: Map | null;
  challenges: MapChallenge[];
  authenticated: boolean;
  masteryProfile: PlayerMasteryMapProfile | null;
  masteryLoading: boolean;
  masteryError: string;
  masteryHistory: CurrentPlayerMasteryResponse | null;
  masteryHistoryLoading: boolean;
  masteryHistoryError: string;
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ "review-changed": []; "retry-mastery": []; "history-page": [page: number]; "retry-history": [] }>();
const difficultyRank = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;
const mapChallenges = computed(() => {
  if (!props.map) return [];
  return [...props.challenges.filter((challenge) => challenge.mapId === props.map?.mapId)].sort((left, right) => {
    if (left.kind === "pioneer" && right.kind !== "pioneer") return -1;
    if (right.kind === "pioneer" && left.kind !== "pioneer") return 1;
    const rank = (value?: string) => {
      const index = difficultyRank.indexOf(value as (typeof difficultyRank)[number]);
      return index === -1 ? difficultyRank.length : index;
    };
    return rank(left.difficulty) - rank(right.difficulty) || left.name.localeCompare(right.name, "zh-CN");
  });
});
const difficultyLabel = computed(() => mapChallenges.value.map((challenge) => challenge.difficulty).filter(Boolean).join("、") || "暂无记录");
const challengeStatusLabel = (status: MapChallenge["status"]) => status === "sunsetting" ? "即将结束" : "";
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
const reducedMotion = usePreferredReducedMotion();
const allowMotion = computed(() => reducedMotion.value !== "reduce");
const [DefineDetailContent, ReuseDetailContent] = createReusableTemplate();

onMounted(() => { hydrated.value = true; });
</script>

<template>
  <DefineDetailContent>
    <div v-if="map" class="detail-card">
      <div class="detail-content">
        <section class="detail-section" aria-labelledby="map-overview-title">
          <div class="section-title"><h3 id="map-overview-title">地图概览</h3><span>{{ mapChallenges.length }} 项挑战</span></div>
          <dl class="detail-facts">
            <div><dt>地图评级</dt><dd>{{ map.difficultyRating ?? "暂无记录" }}</dd></div>
            <div><dt>挑战难度</dt><dd>{{ difficultyLabel }}</dd></div>
          </dl>
          <ul v-if="mapChallenges.length" class="challenge-list">
            <li v-for="challenge in mapChallenges" :key="challenge.challengeId">
              <strong>{{ challenge.name }}</strong>
              <span>{{ [challenge.difficulty, challengeStatusLabel(challenge.status)].filter(Boolean).join(" · ") || "—" }}</span>
            </li>
          </ul>
          <div v-if="map.mechanics?.length" class="mechanics-row"><span>特殊机制</span><div class="mechanics"><UBadge v-for="mechanic in map.mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" /></div></div>
        </section>
        <MapMasteryProfile :map-name="map.mapName" :authenticated="authenticated" :profile="masteryProfile" :loading="masteryLoading" :error="masteryError" :history="masteryHistory" :history-loading="masteryHistoryLoading" :history-error="masteryHistoryError" @retry="emit('retry-mastery')" @history-page="emit('history-page', $event)" @retry-history="emit('retry-history')" />
        <PlayerReviewPanel v-if="map" target-type="map" :target-id="map.mapId" :authenticated="authenticated" @review-changed="emit('review-changed')" />
      </div>
    </div>
  </DefineDetailContent>

  <template v-if="hydrated">
    <UModal
      v-if="isDesktop"
      v-model:open="open"
      :title="map?.mapName ?? '地图详情'"
      :description="map ? `版本 ${map.gameVersion}` : undefined"
      scrollable
      close
      :transition="allowMotion"
      :ui="{ content: 'map-detail-surface map-detail-modal glass-heavy elevation-3 w-[calc(100vw-1rem)] max-w-2xl max-h-[calc(100dvh-1rem)]', body: 'p-0 sm:p-0' }"
    >
      <template #body>
        <ReuseDetailContent />
      </template>
    </UModal>

    <UDrawer
      v-else
      v-model:open="open"
      direction="bottom"
      :title="map?.mapName ?? '地图详情'"
      :description="map ? `版本 ${map.gameVersion}` : undefined"
      close
      :should-scale-background="allowMotion"
      :set-background-color-on-scale="allowMotion"
      :ui="{ content: 'map-detail-surface map-detail-drawer glass-heavy elevation-3 max-h-[calc(100dvh-1rem)]', body: 'p-0' }"
    >
      <template #body>
        <ReuseDetailContent />
      </template>
    </UDrawer>
  </template>
</template>

<style scoped>
.detail-card { min-width: 0; padding: 0 clamp(18px, 4vw, 28px) max(22px, env(safe-area-inset-bottom)); }.detail-content { display: grid; gap: 0; }.detail-section { display: grid; gap: 15px; padding: 22px 0; border-top: 1px solid var(--line); }.detail-section:first-child { padding-top: 22px; border-top: 0; }.section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.section-title h3 { margin: 0; color: var(--text); font-size: 1rem; letter-spacing: -.025em; }.section-title > span { color: var(--quiet); font-size: .75rem; }.detail-facts { display: grid; gap: 10px; margin: 0; }.detail-facts > div, .progress-row > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.detail-facts > div { padding-bottom: 10px; border-bottom: 1px solid var(--line); }.detail-facts dt, .progress-row span, .empty-stat-grid span, .empty-stat-grid small { color: var(--muted); font-size: .8rem; }.detail-facts dd { margin: 0; color: var(--text); font-size: .84rem; font-weight: 650; }
.challenge-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.challenge-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.challenge-list strong { min-width: 0; overflow-wrap: anywhere; color: var(--text); font-size: .84rem; }
.challenge-list span { flex: 0 0 auto; color: var(--quiet); font-size: .76rem; }.detail-facts dd.muted, .empty-stat-grid small { color: var(--quiet); font-weight: 500; }.difficulty-pips { display: flex; gap: 5px; }.difficulty-pips .icon { width: 16px; height: 16px; color: var(--line-strong); }.difficulty-pips .icon.active { color: var(--accent); }.progress-row { display: grid; gap: 9px; }.progress-row strong { color: var(--quiet); font-size: .8rem; font-weight: 600; }.split-section { gap: 18px; }.empty-stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); }.empty-stat-grid > div { display: grid; gap: 7px; padding: 0 18px; }.empty-stat-grid > div:first-child { padding-left: 0; border-right: 1px solid var(--line); }.empty-stat-grid > div:last-child { padding-right: 0; }.empty-stat-grid strong { color: var(--text); font-size: 1.45rem; letter-spacing: -.04em; }.muted-copy { margin: 0; color: var(--quiet); font-size: .84rem; }
@media (max-width: 620px) {
  .detail-card { padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
  .detail-section { gap: 13px; padding: 18px 0; }
  .detail-section:first-child { padding-top: 18px; }
  .detail-facts { gap: 8px; }
  .detail-facts > div { gap: 10px; padding-bottom: 8px; }
  .detail-facts dt, .progress-row span, .empty-stat-grid span, .empty-stat-grid small { font-size: .76rem; }
  .detail-facts dd { max-width: 64%; overflow-wrap: anywhere; text-align: right; }
  .empty-stat-grid > div { padding-inline: 12px; }
}
@media (max-width: 360px) {
  .empty-stat-grid { grid-template-columns: 1fr; gap: 14px; }
  .empty-stat-grid > div, .empty-stat-grid > div:first-child, .empty-stat-grid > div:last-child { padding: 0 0 14px; border-right: 0; border-bottom: 1px solid var(--line); }
  .empty-stat-grid > div:last-child { padding-bottom: 0; border-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) { .detail-card :deep(*) { scroll-behavior: auto; } }
</style>

<style>
.map-detail-surface { border: 1px solid color-mix(in oklch, var(--line-strong) 78%, transparent); }
.map-detail-modal { border-radius: 20px; overflow: hidden; }
.map-detail-drawer { border-bottom: 0; border-radius: 20px 20px 0 0; overflow: hidden; }
</style>
