<script setup lang="ts">
import { createReusableTemplate, useMediaQuery } from "@vueuse/core";
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";

const props = defineProps<{
  map: Map | null;
  challenges: MapChallenge[];
  authenticated: boolean;
}>();

const open = defineModel<boolean>("open", { required: true });
const mapChallenges = computed(() => props.map ? props.challenges.filter((challenge) => challenge.mapId === props.map?.mapId) : []);
const difficultyLabel = computed(() => mapChallenges.value.map((challenge) => challenge.difficulty).filter(Boolean).join("、") || "暂无记录");
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
const [DefineDetailContent, ReuseDetailContent] = createReusableTemplate();

onMounted(() => { hydrated.value = true; });
</script>

<template>
  <DefineDetailContent>
    <div v-if="map" class="detail-card">
      <div class="detail-content">
        <section class="detail-section" aria-labelledby="map-overview-title"><div class="section-title"><h3 id="map-overview-title">地图概览</h3><span>{{ mapChallenges.length }} 项挑战</span></div><dl class="detail-facts"><div><dt>地图评级</dt><dd>{{ map.difficultyRating ?? "暂无记录" }}</dd></div><div><dt>挑战难度</dt><dd>{{ difficultyLabel }}</dd></div><div><dt>通关难度</dt><dd class="muted">{{ authenticated ? "未开放" : "登录后查看" }}</dd></div></dl><div v-if="map.mechanics?.length" class="mechanics-row"><span>特殊机制</span><div class="mechanics"><UBadge v-for="mechanic in map.mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" /></div></div><div class="progress-row"><div><span>挑战进度</span><strong>{{ authenticated ? "未开放" : "登录后查看" }}</strong></div><UProgress :model-value="0" aria-label="挑战进度" /></div></section>
        <section class="detail-section split-section" aria-labelledby="fastest-title"><div class="section-title"><h3 id="fastest-title">最快通关</h3><UBadge label="暂无记录" color="neutral" variant="subtle" /></div><div class="empty-stat-grid"><div><span>传奇最快</span><strong>暂无记录</strong><small>暂无对应玩家</small></div><div><span>地狱最快</span><strong>暂无记录</strong><small>暂无对应玩家</small></div></div></section>
        <section class="detail-section" aria-labelledby="mechanics-title"><div class="section-title"><h3 id="mechanics-title">特殊机制</h3><UBadge label="未开放" color="neutral" variant="subtle" /></div><p class="muted-copy">暂无机制记录。</p></section>
        <section class="detail-section" aria-labelledby="rating-title"><div class="section-title"><h3 id="rating-title">玩家评分</h3><UBadge label="未开放" color="neutral" variant="subtle" /></div><div class="rating-empty"><UIcon name="i-lucide-star" aria-hidden="true" /><span>暂无评分</span></div></section>
      </div>
    </div>
  </DefineDetailContent>

  <template v-if="hydrated">
    <UModal v-if="isDesktop" v-model:open="open" :title="map?.mapName ?? '地图详情'" :description="map ? `版本 ${map.gameVersion}` : undefined" scrollable :ui="{ content: 'map-detail-surface map-detail-modal glass-heavy elevation-3 w-[calc(100vw-1rem)] max-w-2xl max-h-[calc(100dvh-1rem)]', body: 'p-0 sm:p-0' }">
      <template #body>
        <ReuseDetailContent />
      </template>
    </UModal>

    <UDrawer v-else v-model:open="open" direction="bottom" :title="map?.mapName ?? '地图详情'" :description="map ? `版本 ${map.gameVersion}` : undefined" should-scale-background set-background-color-on-scale :ui="{ content: 'map-detail-surface map-detail-drawer glass-heavy elevation-3 max-h-[calc(100dvh-1rem)]', body: 'p-0' }">
      <template #body>
        <ReuseDetailContent />
      </template>
    </UDrawer>
  </template>
</template>

<style scoped>
.detail-card { min-width: 0; padding: 0 clamp(18px, 4vw, 28px) max(22px, env(safe-area-inset-bottom)); }.detail-content { display: grid; gap: 0; }.detail-section { display: grid; gap: 15px; padding: 22px 0; border-top: 1px solid var(--line); }.detail-section:first-child { padding-top: 22px; border-top: 0; }.section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.section-title h3 { margin: 0; color: var(--text); font-size: 1rem; letter-spacing: -.025em; }.section-title > span { color: var(--quiet); font-size: .75rem; }.detail-facts { display: grid; gap: 10px; margin: 0; }.detail-facts > div, .progress-row > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.detail-facts > div { padding-bottom: 10px; border-bottom: 1px solid var(--line); }.detail-facts dt, .progress-row span, .empty-stat-grid span, .empty-stat-grid small { color: var(--muted); font-size: .8rem; }.detail-facts dd { margin: 0; color: var(--text); font-size: .84rem; font-weight: 650; }.detail-facts dd.muted, .empty-stat-grid small { color: var(--quiet); font-weight: 500; }.difficulty-pips { display: flex; gap: 5px; }.difficulty-pips .icon { width: 16px; height: 16px; color: var(--line-strong); }.difficulty-pips .icon.active { color: var(--accent); }.progress-row { display: grid; gap: 9px; }.progress-row strong { color: var(--quiet); font-size: .8rem; font-weight: 600; }.split-section { gap: 18px; }.empty-stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); }.empty-stat-grid > div { display: grid; gap: 7px; padding: 0 18px; }.empty-stat-grid > div:first-child { padding-left: 0; border-right: 1px solid var(--line); }.empty-stat-grid > div:last-child { padding-right: 0; }.empty-stat-grid strong { color: var(--text); font-size: 1.45rem; letter-spacing: -.04em; }.muted-copy { margin: 0; color: var(--quiet); font-size: .84rem; }.rating-empty { display: flex; align-items: center; gap: 8px; color: var(--quiet); font-size: .84rem; }.rating-empty .icon { color: var(--line-strong); }
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
